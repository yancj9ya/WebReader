export type ReaderSettings = {
  scale: number;
  viewMode: "single" | "double" | "continuous";
  showThumbs: boolean;
};

const STORAGE_KEY = "local_pdf_reader:reader_settings:v1";

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  scale: 1.08,
  viewMode: "single",
  showThumbs: true
};

export function loadReaderSettings(): ReaderSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_READER_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      scale:
        typeof parsed.scale === "number" && parsed.scale >= 0.5 && parsed.scale <= 3
          ? Number(parsed.scale.toFixed(2))
          : DEFAULT_READER_SETTINGS.scale,
      viewMode:
        parsed.viewMode === "single" || parsed.viewMode === "double" || parsed.viewMode === "continuous"
          ? parsed.viewMode
          : DEFAULT_READER_SETTINGS.viewMode,
      showThumbs: typeof parsed.showThumbs === "boolean" ? parsed.showThumbs : DEFAULT_READER_SETTINGS.showThumbs
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

