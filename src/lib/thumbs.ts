// Бакет thumbnails приватный: миниатюры рендерятся через подписанные ссылки.
// В projects.thumbnail_url исторически лежат полные публичные URL, а в новых
// записях — просто путь внутри бакета. Эта функция приводит оба варианта к пути.
export const thumbnailPath = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const m = value.match(/\/thumbnails\/(.+)$/);
  if (m) return decodeURIComponent(m[1].split("?")[0]);
  return value.startsWith("http") ? null : value;
};
