## Что строим

Новый режим проекта — **Auto-Montage**: пользователь загружает один аудио-трек + N видео-клипов, ИИ автоматически склеивает их в финальный ролик (с учётом смысла или ритма), результат открывается в полноценном таймлайн-редакторе, где каждый клип можно двигать, резать, менять, удалять.

## Поток пользователя

1. На **Dashboard** новая кнопка «Авто-монтаж» рядом с обычной загрузкой → ведёт на `/upload/montage`.
2. На странице загрузки:
   - один слот для аудио (mp3/wav/m4a),
   - мульти-загрузка клипов (drag-and-drop, до 20 шт),
   - выбор формата (stories / landscape / square),
   - кнопка «Собрать монтаж».
3. Создаётся проект (`projects.kind = 'montage'`), все файлы летят в Storage, запускается edge function `auto-montage`.
4. После сборки — редирект в **Editor** с новой панелью **Timeline** (таймлайн-редактор) поверх обычного превью.

## Логика ИИ (edge function `auto-montage`)

**Шаг 1 — анализ аудио (гибрид):**
- Прогоняем аудио через ElevenLabs / Whisper → получаем транскрипт со словами и таймкодами.
- Если транскрипт почти пустой (≤ 5 слов на 30с) → считаем это **музыкой**, иначе — **речью**.
- Для музыки: считаем энергию по фреймам (через ffmpeg `astats` или `silencedetect`) → находим bit/beat-маркеры и зоны спада/подъёма.
- Для речи: режем транскрипт на **смысловые блоки 3–10 секунд** (по паузам + смыслу через Gemini).

**Шаг 2 — анализ клипов:**
- По одному кадру с середины каждого клипа → Gemini Vision выдаёт короткое описание («крупный план рук», «город сверху», «человек улыбается», доминирующие цвета, движение).
- Сохраняем `clips.meta = { description, tags, dominant_motion, duration }`.

**Шаг 3 — раскладка (Gemini 2.5 Pro, structured output):**
Вход: список блоков аудио (timecode + текст/энергия) + список клипов с описаниями.  
Выход: массив `segments = [{ block_id, clip_id, clip_in, clip_out, audio_start, audio_end, reason }]`.  
Правила в промпте:
- длительность сегмента = длительности блока (под-режем клип, если он длиннее);
- клип берётся целиком, если по длине помещается; иначе вырезаем самый релевантный отрезок;
- не повторять один клип подряд, баланс использования;
- для музыки — смена клипа на сильной доле;
- для речи — клип по смыслу фразы.

**Шаг 4 — сохранение:**
- Пишем `montage_segments` в БД.
- Превью рендерим **на клиенте** в `<canvas>` + `<audio>` (как уже сделано в `VideoPreview`), не гоняем тяжёлый рендер на сервере. Только финальный экспорт идёт через существующий ExportDialog (ffmpeg.wasm).

## БД (миграция)

```sql
ALTER TABLE projects ADD COLUMN kind text NOT NULL DEFAULT 'single';
ALTER TABLE projects ADD COLUMN audio_path text;

CREATE TABLE montage_clips (
  id uuid PK, project_id uuid, user_id uuid,
  storage_path text, duration numeric,
  meta jsonb,                 -- {description, tags, motion}
  order_index int,
  created_at timestamptz
);

CREATE TABLE montage_segments (
  id uuid PK, project_id uuid, user_id uuid,
  order_index int,
  clip_id uuid REFERENCES montage_clips(id),
  clip_in numeric, clip_out numeric,        -- внутри клипа
  audio_start numeric, audio_end numeric,   -- на финальной таймлинии
  reason text, locked boolean DEFAULT false,
  created_at timestamptz, updated_at timestamptz
);
```
+ GRANT-ы + RLS по `auth.uid() = user_id` + триггер `updated_at`.

## Edge functions

- `auto-montage` (новая) — оркестратор: анализ аудио → анализ клипов → Gemini раскладка → запись `montage_segments`.
- `montage-segment-action` (новая) — точечные операции с одним сегментом: `replace_clip` (выбрать другой загруженный клип), `trim` (изменить in/out), `move` (поменять порядок), `delete`, `split`, `regenerate` (попросить ИИ предложить другой клип сюда).
- `transcribe-audio` — переиспользуем существующую `transcribe-video` с флагом `audio_only=true`.

## UI

### Новая страница `src/pages/UploadMontage.tsx`
Аудио-слот + сетка клипов (превью, длительность, ✕), выбор формата, кнопка «Собрать монтаж».

### Новая панель `src/components/editor/panels/TimelinePanel.tsx` (центральная, под превью)
Горизонтальный таймлайн в стиле CapCut:
```
[Audio waveform ─────────────────────────────]
[Clip1][Clip2 ][Clip3][Clip4    ][Clip5]
       ↑drag-handle             ↑split here
```
- drag-and-drop сегментов (через `@dnd-kit`),
- ручки in/out на каждом сегменте (resize),
- right-click меню: «Заменить клип», «Разделить здесь», «Удалить», «Перегенерировать ИИ»,
- кнопка «+ Добавить клип» (открывает загрузку дополнительных),
- сверху панель: «Авто-пересборка», «Сбросить к версии ИИ», «Применить».

### Превью `VideoPreview` 
Расширяем: если `project.kind = 'montage'` — рендерим текущий сегмент таймлинии (canvas рисует кадр из видео по `clip_in + (currentTime - audio_start)`), аудио играет сквозняком из `project.audio_path`.

### Dashboard
Кнопка-карточка «Авто-монтаж · загрузи аудио и клипы → ИИ соберёт» → `/upload/montage`.

## Файлы

**Новые:**
- `src/pages/UploadMontage.tsx`
- `src/components/editor/panels/TimelinePanel.tsx`
- `supabase/functions/auto-montage/index.ts`
- `supabase/functions/montage-segment-action/index.ts`
- миграция (новые таблицы + колонки)

**Изменяемые:**
- `src/pages/Dashboard.tsx` — карточка «Авто-монтаж».
- `src/pages/Editor.tsx` — условный рендер TimelinePanel для `kind='montage'`.
- `src/components/editor/VideoPreview.tsx` — режим монтажа (играть по сегментам).
- `src/App.tsx` — роут `/upload/montage`.
- `supabase/functions/transcribe-video/index.ts` — поддержать audio-only вход.

## Порядок работы

1. Миграция БД (`projects.kind`, `audio_path`, `montage_clips`, `montage_segments`).
2. Страница `UploadMontage` + роут + кнопка на Dashboard.
3. Edge function `auto-montage` (анализ → раскладка → запись).
4. `TimelinePanel` (отрисовка + drag/resize/split/delete).
5. Расширение `VideoPreview` под режим монтажа.
6. `montage-segment-action` + подключение действий в TimelinePanel.
7. Прогон на реальном проекте: 1 музыка + 6 клипов / 1 голос + 8 клипов.
