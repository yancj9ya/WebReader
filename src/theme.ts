export type ThemeId = "daylight" | "sepia" | "sage" | "charcoal";

export type ThemeOption = {
  id: ThemeId;
  label: string;
  note: string;
};

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "daylight", label: "日光白", note: "高亮环境下保持清晰对比" },
  { id: "sepia", label: "纸张棕", note: "暖色低蓝光，降低视觉疲劳" },
  { id: "sage", label: "鼠尾草绿", note: "中性低饱和，长时阅读更柔和" },
  { id: "charcoal", label: "炭灰夜读", note: "低亮暗底，减少夜间眩光" }
];

const STORAGE_KEY = "local_pdf_reader:theme:v1";

export function loadTheme(): ThemeId {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "daylight" || raw === "sepia" || raw === "sage" || raw === "charcoal") {
    return raw;
  }
  return "sage";
}

export function saveTheme(theme: ThemeId): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

