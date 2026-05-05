# Submagic-style редактор

## Цель
Переделать `/editor/:id` так, чтобы всё помещалось на одном экране без скролла, видео было компактнее, а вокруг — кнопки, открывающие панели инструментов (как в Submagic). Добавить аудио-инструменты, музыку с громкостью, 4K-экспорт.

## Новый layout

```text
┌──────────── Header (Назад · Название · Экспорт 4K) ────────────┐
├────────────────────┬────────────────────┬─────────────────────┤
│  ЛЕВАЯ КОЛОНКА     │   ЦЕНТР (видео)    │  ПРАВАЯ КОЛОНКА     │
│  Edit Tools        │   ~360×640px       │  AI Boost           │
│  ┌──────────────┐  │   9:16 кадр        │  ┌────────────────┐ │
│  │ CC Captions  │  │   с контролами     │  │ ✦ AI Captions  │ │
│  │ ◉ Scenes     │  │                    │  │ ◉ Auto Zooms   │ │
│  │ ✂ Trim       │  │                    │  │ ⌗ Auto B-rolls │ │
│  └──────────────┘  │                    │  │ 🎵 Clean Audio │ │
│  AI Tools          │                    │  │ ♪ Add Music    │ │
│  ┌──────────────┐  │                    │  └────────────────┘ │
│  │ ⚓ Hook      │  │                    │                     │
│  │ 🎤 Clean Aud │  │                    │  Active panel slot  │
│  │ 👁 Eye Cont. │  │                    │  (когда что-то      │
│  └──────────────┘  │                    │   выбрано)          │
└────────────────────┴────────────────────┴─────────────────────┘
```

- 3-колоночный grid: `260px | 1fr | 320px`. На lg+ всё помещается в `100vh - header`.
- Видео-превью: `max-height: calc(100vh - 200px)`, ширина авто, `aspect-ratio: 9/16`. Это даёт компактный кадр ~360×640 на FullHD.
- Без вертикального скролла страницы — скроллятся только внутренние панели.

## Кнопки и панели (sheet/dialog)

**Edit (левая колонка, верх)**
- **Captions** — открывает `StylePanel` (уже есть, перенести триггер сюда; и пресеты, и кастом).
- **Scenes** — открывает Sheet со списком сцен (то, что сейчас в левой колонке) + редактирование текста/highlight.
- **Trim Video** — Sheet с двумя ползунками start/end → сохранить в `projects.trim_start/trim_end` (новые колонки).

**AI Boost (правая колонка)** — toggle-список, как на скриншоте Submagic:
- AI Captions (вкл/выкл показ субтитров).
- AI Auto Zooms — кнопка «Применить» вызывает существующую `analyze-scenes` функцию и проставляет `zoom` на сценах.
- AI Auto B-rolls — открывает sub-панель «Источник B-roll»:
  - Pexels (бесплатно, по ключевым словам сцены)
  - Pixabay
  - Загрузить свои клипы (storage `b-rolls` bucket)
  - сохраняем выбор в `scenes.broll_url`.
- Clean Audio — toggle, на экспорте применяется фильтр (high-pass + noise gate в edge-функции через ffmpeg).
- Add Music — Sheet:
  - библиотека из 8–10 бесплатных треков (lo-fi, corporate, energetic) + загрузка своего mp3
  - слайдер громкости 0–100% (по умолчанию 20%)
  - сохраняем `projects.music_url`, `projects.music_volume`.

**AI Tools (левая колонка, низ)**
- Hook Title (уже есть в `analyze-scenes`).
- Remove Silences (todo-флаг).
- Eye Contact (todo-флаг).
Каждый — Switch + tooltip «применится при экспорте».

## Экспорт в 4K

Кнопка **Export** в хедере → диалог:
- Качество: 720p / 1080p / **4K (3840×2160 для 16:9, 2160×3840 для 9:16)**
- Формат: MP4 (H.264).
- Включить субтитры / музыку / b-rolls (галочки).
- Кнопка «Начать экспорт» → вызывает edge-функцию `export-video`.

Edge-функция `export-video` (новая):
- Берёт исходное видео + words + scenes + style + музыку.
- Запускает рендер через ffmpeg (Deno + ffmpeg.wasm недостаточно для 4K → используем внешний сервис **Shotstack** или **Creatomate** API). Поскольку нет API-ключа, на первом этапе делаем server-side ffmpeg через временный воркер: мы вернём сигнал «в процессе», сохраняем job в таблицу `export_jobs`, юзер видит прогресс и получает ссылку на скачивание.
- Для MVP: рендерим 1080p в edge функции через ffmpeg-static (если получится), а для 4K — показываем «Premium / coming soon» с подсказкой.

> Уточнение: реальный 4K-рендер с субтитрами/музыкой/b-roll'ами требует серверного ffmpeg или платного API. В рамках этой задачи добавим UI экспорта + edge-функцию `export-video`, которая собирает SRT + конкатенирует через ffmpeg в 1080p и помечает 4K как «готовится». Если нужен честный 4K — потребуется подключить Shotstack/Creatomate (попрошу ключ отдельно).

## БД-изменения (миграция)

- `projects`: добавить `trim_start float`, `trim_end float`, `music_url text`, `music_volume int default 20`, `clean_audio bool default false`, `captions_enabled bool default true`, `export_quality text default '1080p'`.
- `scenes`: добавить `broll_url text` (опц.).
- Новая таблица `export_jobs` (id, project_id, user_id, status, quality, output_url, progress, created_at) + RLS «owner only».
- Storage buckets: `music` (public read), `b-rolls` (private, owner read).

## Файлы

- `src/pages/Editor.tsx` — переписать layout на 3 колонки.
- `src/components/editor/VideoPreview.tsx` — ограничить высоту, убрать огромный размер.
- `src/components/editor/panels/ScenesPanel.tsx` — вынести список сцен из Editor.
- `src/components/editor/panels/TrimPanel.tsx` — новый.
- `src/components/editor/panels/MusicPanel.tsx` — новый, со слайдером громкости и библиотекой.
- `src/components/editor/panels/BrollPanel.tsx` — новый, выбор источника.
- `src/components/editor/panels/ExportDialog.tsx` — новый.
- `src/components/editor/AIBoostPanel.tsx` — правая колонка с тогглами.
- `src/components/editor/EditToolsPanel.tsx` — левая колонка с кнопками.
- `supabase/functions/export-video/index.ts` — новая edge-функция.
- Миграция БД с полями выше.

## Уточнение по B-rolls
Для авто-вставки сторонних видео понадобится источник. Предлагаю **Pexels API** — бесплатно, без оплаты пользователем; ключ запросим через secret `PEXELS_API_KEY`. Если согласишься — добавлю в плане edge-функцию `fetch-broll`, которая по ключевым словам сцены берёт релевантный клип.
