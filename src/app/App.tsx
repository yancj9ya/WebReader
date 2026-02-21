import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { BookshelfPage } from "../features/library/BookshelfPage";
import { loadTheme, saveTheme, type ThemeId } from "../theme";

const ReaderPage = lazy(async () => {
  const mod = await import("../features/reader/ReaderPage");
  return { default: mod.ReaderPage };
});

export function App() {
  const initialTheme = useMemo(() => loadTheme(), []);
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);

  useEffect(() => {
    saveTheme(theme);
  }, [theme]);

  if (currentBookId) {
    return (
      <div className={`app-shell theme-${theme}`}>
        <Suspense fallback={<main className="app"><p className="meta">正在加载阅读器...</p></main>}>
          <ReaderPage
            bookId={currentBookId}
            onBack={() => setCurrentBookId(null)}
            onOpenBook={setCurrentBookId}
            theme={theme}
            onThemeChange={setTheme}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      <BookshelfPage onOpenBook={setCurrentBookId} theme={theme} onThemeChange={setTheme} />
    </div>
  );
}
