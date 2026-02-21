const PREFIX = "pdf-local-reader:progress:";

export function loadProgress(fileKey: string): number {
  const value = localStorage.getItem(PREFIX + fileKey);
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function saveProgress(fileKey: string, page: number): void {
  localStorage.setItem(PREFIX + fileKey, String(page));
}
