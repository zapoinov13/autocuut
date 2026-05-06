## Проблемы сейчас

1. **Шрифты выглядят одинаково "жирно"** — в `index.html` подгружаются только тяжёлые веса (Inter 400/600/700/900, Montserrat 600/800/900, Poppins 600/800/900 и т.д.). Light/Regular весов нет, поэтому слайдер "Жирность 300-900" по факту скачет между 2-3 значениями.
2. **Размер/позиция субтитров не видны вживую** — настройки лежат в `<Sheet>`, который закрывает превью; пока редактируешь — не видишь результата.
3. **Нельзя двигать субтитры мышкой** — позиция фиксирована тремя пресетами `top/center/bottom`.
4. **Окно редактирования субтитров неудобное** — нужно как в Submagic: клик по титру → открывается панель с пресетами + live-настройками + drag.

## Что делаем

### 1. Чиним загрузку шрифтов (`index.html`)

Меняем google-fonts ссылку на полный диапазон весов 100-900 для всех используемых семейств, чтобы слайдер жирности реально работал:
- Inter, Montserrat, Poppins, Rubik, Roboto — `wght@100;200;300;400;500;600;700;800;900`
- Oswald — `wght@200;300;400;500;600;700`
- Anton, Bebas Neue, Archivo Black — единственный вес (display fonts), оставляем
- Добавляем ещё пары шрифтов: **Manrope, Outfit, DM Sans, Space Grotesk, Plus Jakarta Sans** — современные читабельные

Расширяем `FONT_OPTIONS` в `src/lib/styles.ts` соответственно.

### 2. Drag-перетаскивание субтитров (`VideoPreview.tsx`)

- Добавляем числовое поле `subtitleY` (0-100, % от высоты превью) в `SubtitleStyle` — заменяет/дополняет `position: top|center|bottom`.
- Контейнер с субтитрами становится `absolute` с `top: ${subtitleY}%` + `pointer-events: auto` + `cursor: grab`.
- На `onPointerDown` стартуем drag, на `onPointerMove` пересчитываем процент относительно высоты `containerRef`, на `onPointerUp` вызываем `onPositionChange(y)` → сохраняем в `projects.subtitle_y` (миграция: новая колонка `subtitle_y numeric default 80`).
- Пресеты `top/center/bottom` остаются как быстрые кнопки (выставляют 8/50/85).

### 3. Новая панель редактирования субтитров (`StylePanel.tsx` → переписываем как Tabs)

Вместо одного длинного `<Sheet>` — два таба внутри:

**Таб "Стили"** — крупная сетка пресетов с настоящим визуальным превью (рендерим название стиля его же шрифтом/цветом/обводкой как на скрине Submagic):
```
[Anton]  [Bebas]  [Hormozi]
[Clean]  [Bold]   [Mr.Beast]
...
```

**Таб "Настройка"** — все слайдеры (шрифт, размер, жирность, цвет, обводка, тень, фон, регистр, **позиция Y слайдером 0-100%**) + мини-live-превью.

Добавляем кнопку "Редактировать стиль" прямо на превью видео — клик по самим субтитрам открывает Sheet сразу на табе "Настройка". Реализуем через общий `useState` + проп `onEditSubtitle` в `VideoPreview`.

### 4. Сохранение позиции в БД

Миграция:
```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS subtitle_y numeric DEFAULT 80;
```

В `Editor.tsx` пробрасываем `subtitleY` из `project.subtitle_y` в `VideoPreview` и `StylePanel`. На `onPositionChange` — `update({ subtitle_y })` + invalidate query.

### 5. Учёт subtitle_y в экспорте

В `ExportDialog.tsx` (canvas-рендер) при позиционировании subtitle строки заменяем хардкод `bottom 10%` на `subtitleY%` от высоты canvas.

## Затронутые файлы

- `index.html` — расширенные веса google fonts + новые семейства
- `src/lib/styles.ts` — `subtitleY` в `SubtitleStyle`, расширенный `FONT_OPTIONS`
- `src/components/editor/StylePanel.tsx` — переписать с Tabs (Стили / Настройка), визуальные превью пресетов, слайдер позиции Y
- `src/components/editor/VideoPreview.tsx` — pointer-drag субтитров, использование `subtitleY`, клик→редактирование
- `src/components/editor/panels/ExportDialog.tsx` — учёт `subtitleY` в canvas-рендере
- `src/pages/Editor.tsx` — пробросить `subtitleY` и обработчик сохранения
- Миграция: добавить колонку `subtitle_y`

После одобрения — переключаюсь в build mode и применяю изменения.