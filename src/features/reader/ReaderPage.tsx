import { type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  getBook,
  listBookmarks,
  listBooks,
  toggleBookmark,
  updateBookReading,
  type StoredBookMeta,
  type StoredBookmark
} from "../library/libraryStore";
import { openPdfFromData } from "../pdf/usePdfDocument";
import { PdfCanvas } from "./PdfCanvas";
import { loadReaderSettings, saveReaderSettings } from "./readerSettings";
import { ThumbnailPanel } from "./ThumbnailPanel";
import { THEME_OPTIONS, type ThemeId } from "../../theme";

type Props = {
  bookId: string;
  onBack: () => void;
  onOpenBook: (nextBookId: string) => void;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
};

type OutlineItem = {
  depth: number;
  pageNumber: number | null;
  title: string;
};

type ViewMode = "single" | "double" | "continuous";

function normalizeOutlineTitle(title: string): string {
  const cleaned = title.replace(/\s+/g, " ").trim();
  return cleaned || "(未命名目录)";
}

async function resolveDestinationPage(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  let destination = dest;

  if (typeof destination === "string") {
    destination = await doc.getDestination(destination);
  }

  if (!Array.isArray(destination) || destination.length === 0) {
    return null;
  }

  const first = destination[0] as unknown;

  if (typeof first === "number" && Number.isFinite(first)) {
    return first + 1;
  }

  if (first && typeof first === "object") {
    const index = await doc.getPageIndex(first as never);
    return index + 1;
  }

  return null;
}

async function collectOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const outline = (await doc.getOutline()) ?? [];
  const items: OutlineItem[] = [];

  async function walk(nodes: NonNullable<typeof outline>, depth: number) {
    for (const node of nodes) {
      const pageNumber = node.dest ? await resolveDestinationPage(doc, node.dest) : null;
      items.push({
        depth,
        pageNumber,
        title: normalizeOutlineTitle(node.title)
      });

      if (node.items.length > 0) {
        await walk(node.items, depth + 1);
      }
    }
  }

  await walk(outline, 0);
  return items;
}

function sortByShelfSequence(books: StoredBookMeta[]): StoredBookMeta[] {
  return [...books].sort((a, b) => {
    if (a.addedAt !== b.addedAt) {
      return a.addedAt - b.addedAt;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

export function ReaderPage({ bookId, onBack, onOpenBook, theme, onThemeChange }: Props) {
  const initialSettings = useMemo(() => loadReaderSettings(), []);
  const [title, setTitle] = useState("PDF Reader");
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(initialSettings.scale);
  const [error, setError] = useState<string | null>(null);
  const [jumpInput, setJumpInput] = useState("1");
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmark[]>([]);
  const [showThumbs, setShowThumbs] = useState(initialSettings.showThumbs);
  const [viewMode, setViewMode] = useState<ViewMode>(initialSettings.viewMode);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showJumpDialog, setShowJumpDialog] = useState(false);
  const [showOutlineDialog, setShowOutlineDialog] = useState(false);
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [nextBook, setNextBook] = useState<StoredBookMeta | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pagedViewerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scrollTickingRef = useRef(false);
  const wheelStateRef = useRef({ delta: 0, lastFlipAt: 0 });

  const pageOptions = useMemo(() => Array.from({ length: totalPages }, (_, i) => i + 1), [totalPages]);
  const currentBookmarked = useMemo(() => bookmarks.some((item) => item.page === pageNumber), [bookmarks, pageNumber]);
  const pageStep = viewMode === "double" ? 2 : 1;
  const spreadLabel =
    viewMode === "double" && doc ? `跨页 ${pageNumber}-${Math.min(totalPages, pageNumber + 1)}` : null;
  const shouldShowNextBookFab =
    !!doc &&
    !!nextBook &&
    (viewMode === "double" ? pageNumber >= Math.max(1, totalPages - 1) : pageNumber >= totalPages);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setDoc(null);
      setOutlineItems([]);
      setSearchResults([]);
      setNextBook(null);

      const [book, allBooksRaw] = await Promise.all([getBook(bookId), listBooks()]);
      if (!book) {
        setError("未找到该书籍，请返回书架重新导入。");
        return;
      }

      try {
        const loadedDoc = await openPdfFromData(book.pdfData);
        const [outline, savedBookmarks] = await Promise.all([collectOutline(loadedDoc), listBookmarks(book.id)]);
        if (cancelled) {
          return;
        }

        const safePage = Math.min(Math.max(book.lastPage, 1), loadedDoc.numPages);
        setTitle(book.title);
        setDoc(loadedDoc);
        setTotalPages(loadedDoc.numPages);
        setPageNumber(safePage);
        setJumpInput(String(safePage));
        setOutlineItems(outline);
        setBookmarks(savedBookmarks);

        const allBooks = sortByShelfSequence(allBooksRaw);
        const currentIndex = allBooks.findIndex((item) => item.id === book.id);
        if (currentIndex >= 0 && currentIndex + 1 < allBooks.length) {
          setNextBook(allBooks[currentIndex + 1]);
        } else {
          setNextBook(null);
        }
      } catch {
        if (!cancelled) {
          setError("PDF 加载失败，可能文件已损坏。");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!doc) {
      return;
    }

    setJumpInput(String(pageNumber));
    updateBookReading(bookId, pageNumber, totalPages);
  }, [bookId, doc, pageNumber, totalPages]);

  useEffect(() => {
    saveReaderSettings({
      scale,
      viewMode,
      showThumbs
    });
  }, [scale, viewMode, showThumbs]);

  useEffect(() => {
    if (viewMode !== "double") {
      return;
    }
    if (pageNumber % 2 === 0) {
      setPageNumber((prev) => Math.max(1, prev - 1));
    }
  }, [pageNumber, viewMode]);

  async function jumpToPage(page: number) {
    if (!doc) {
      return;
    }
    const safe = Math.min(Math.max(page, 1), doc.numPages);
    if (viewMode === "continuous") {
      const target = pageRefs.current[safe];
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    setPageNumber(safe);
  }

  async function runSearch() {
    if (!doc) {
      return;
    }

    const keyword = searchInput.trim().toLowerCase();
    if (!keyword) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const matches: number[] = [];
      for (let current = 1; current <= doc.numPages; current += 1) {
        const page = await doc.getPage(current);
        const text = await page.getTextContent();
        const content = text.items
          .map((item) => {
            if ("str" in item) {
              return item.str;
            }
            return "";
          })
          .join(" ")
          .toLowerCase();

        if (content.includes(keyword)) {
          matches.push(current);
        }
      }

      setSearchResults(matches);
      if (matches.length > 0) {
        setPageNumber(matches[0]);
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleToggleBookmark() {
    await toggleBookmark(bookId, pageNumber);
    const latest = await listBookmarks(bookId);
    setBookmarks(latest);
  }

  function handleContinuousScroll() {
    if (viewMode !== "continuous" || !scrollContainerRef.current) {
      return;
    }

    if (scrollTickingRef.current) {
      return;
    }

    scrollTickingRef.current = true;
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) {
        scrollTickingRef.current = false;
        return;
      }

      const top = container.getBoundingClientRect().top;
      let closest = 1;
      let minDistance = Number.POSITIVE_INFINITY;

      for (const page of pageOptions) {
        const node = pageRefs.current[page];
        if (!node) {
          continue;
        }
        const distance = Math.abs(node.getBoundingClientRect().top - top - 40);
        if (distance < minDistance) {
          minDistance = distance;
          closest = page;
        }
      }

      if (closest !== pageNumber) {
        setPageNumber(closest);
      }
      scrollTickingRef.current = false;
    });
  }

  function handleSinglePageWheel(event: WheelEvent<HTMLDivElement>) {
    if ((viewMode !== "single" && viewMode !== "double") || !doc || event.ctrlKey) {
      return;
    }

    event.preventDefault();
    const now = Date.now();
    const state = wheelStateRef.current;

    if (now - state.lastFlipAt < 260) {
      return;
    }

    state.delta += event.deltaY;
    if (Math.abs(state.delta) < 55) {
      return;
    }

    if (state.delta > 0 && pageNumber < totalPages) {
      setPageNumber((prev) => Math.min(totalPages, prev + pageStep));
      state.lastFlipAt = now;
    } else if (state.delta < 0 && pageNumber > 1) {
      setPageNumber((prev) => Math.max(1, prev - pageStep));
      state.lastFlipAt = now;
    }
    state.delta = 0;
  }

  async function fitToReaderHeight() {
    if (!doc || viewMode === "continuous") {
      return;
    }

    const container = pagedViewerRef.current;
    if (!container) {
      return;
    }

    const page = await doc.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const availableHeight = container.clientHeight;
    if (availableHeight <= 0) {
      return;
    }

    const nextScale = Math.min(3, Math.max(0.5, (availableHeight / baseViewport.height) * 0.96));
    setScale(Number(nextScale.toFixed(2)));

    // Re-check with actual rendered height and apply one corrective pass.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentContainer = pagedViewerRef.current;
        if (!currentContainer) {
          return;
        }

        const overflow = currentContainer.scrollHeight - currentContainer.clientHeight;
        if (overflow <= 0) {
          return;
        }

        const ratio = currentContainer.clientHeight / currentContainer.scrollHeight;
        const corrected = Math.min(3, Math.max(0.5, Number((nextScale * ratio * 0.98).toFixed(2))));
        if (corrected < nextScale) {
          setScale(corrected);
        }
      });
    });
  }

  return (
    <div className="reader-shell">
      {doc && (
        <ThumbnailPanel
          doc={doc}
          totalPages={totalPages}
          currentPage={pageNumber}
          collapsed={!showThumbs}
          onToggle={() => setShowThumbs((v) => !v)}
          onJump={jumpToPage}
        />
      )}

      <section className="reader-main">
        <header className="reader-header">
          <div className="reader-title-wrap">
            <button className="icon-btn" onClick={onBack} title="返回书架" aria-label="返回书架">
              ⌂
            </button>
            <h2>{title}</h2>
            {spreadLabel && <span className="title-subtle">{spreadLabel}</span>}
          </div>
          <div className="reader-head-actions">
            <select value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeId)} title="阅读主题">
              {THEME_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              disabled={!doc}
              onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.05).toFixed(2))))}
              title="缩小"
              aria-label="缩小"
            >
              -
            </button>
            <input
              type="range"
              className="zoom-slider"
              min={50}
              max={300}
              step={1}
              value={Math.round(scale * 100)}
              onChange={(event) => setScale(Number(event.target.value) / 100)}
              disabled={!doc}
              title="缩放"
            />
            <button
              className="icon-btn"
              disabled={!doc}
              onClick={() => setScale((s) => Math.min(3, Number((s + 0.05).toFixed(2))))}
              title="放大"
              aria-label="放大"
            >
              +
            </button>
            <button
              className="icon-btn"
              disabled={!doc || viewMode === "continuous"}
              onClick={fitToReaderHeight}
              title="适配高度"
              aria-label="适配高度"
            >
              ↕
            </button>
            <div className="mode-switch">
              <button
                className={viewMode === "single" ? "is-active" : ""}
                onClick={() => setViewMode("single")}
                disabled={!doc}
                title="单页模式"
                aria-label="单页模式"
              >
                ▢
              </button>
              <button
                className={viewMode === "double" ? "is-active" : ""}
                onClick={() => setViewMode("double")}
                disabled={!doc}
                title="双页模式"
                aria-label="双页模式"
              >
                ▣
              </button>
              <button
                className={viewMode === "continuous" ? "is-active" : ""}
                onClick={() => setViewMode("continuous")}
                disabled={!doc}
                title="连续模式"
                aria-label="连续模式"
              >
                ≋
              </button>
            </div>
            <button className="icon-btn" disabled={!doc} onClick={() => setShowJumpDialog(true)} title="跳页" aria-label="跳页">
              ⇥
            </button>
            <button className="icon-btn" disabled={!doc} onClick={() => setShowSearchDialog(true)} title="搜索" aria-label="搜索">
              ⌕
            </button>
            <button
              className="icon-btn"
              disabled={!doc}
              onClick={() => setShowBookmarkDialog(true)}
              title="书签列表"
              aria-label="书签列表"
            >
              ≣
            </button>
            <button className="icon-btn" disabled={!doc} onClick={() => setShowOutlineDialog(true)} title="目录" aria-label="目录">
              ☰
            </button>
            <button
              className="icon-btn"
              disabled={!doc}
              onClick={handleToggleBookmark}
              title={currentBookmarked ? "取消书签" : "加入书签"}
              aria-label={currentBookmarked ? "取消书签" : "加入书签"}
            >
              {currentBookmarked ? "★" : "☆"}
            </button>
            <span className="meta">
              页码: {doc ? pageNumber : 0}/{totalPages} | 缩放: {Math.round(scale * 100)}%
            </span>
          </div>
        </header>

        <section className="card viewer-card">
          {error && <p className="warn">{error}</p>}
          {!doc && !error && <p className="meta">正在加载文档...</p>}

          {doc && viewMode === "single" && (
            <div className="viewer-wrap viewer-wrap-single" onWheel={handleSinglePageWheel} ref={pagedViewerRef}>
              <PdfCanvas doc={doc} pageNumber={pageNumber} scale={scale} className="viewer-page" />
            </div>
          )}

          {doc && viewMode === "double" && (
            <div className="viewer-wrap viewer-wrap-single" onWheel={handleSinglePageWheel} ref={pagedViewerRef}>
              <div className="double-spread">
                <div className="double-leaf left">
                  <PdfCanvas doc={doc} pageNumber={pageNumber} scale={scale} className="viewer-page viewer-page-double" />
                </div>
                <div className="double-leaf right">
                  {pageNumber + 1 <= totalPages ? (
                    <PdfCanvas doc={doc} pageNumber={pageNumber + 1} scale={scale} className="viewer-page viewer-page-double" />
                  ) : (
                    <div className="viewer-page viewer-page-double viewer-page-placeholder" />
                  )}
                </div>
              </div>
            </div>
          )}

          {doc && viewMode === "continuous" && (
            <div className="viewer-wrap" ref={scrollContainerRef} onScroll={handleContinuousScroll}>
              {pageOptions.map((page) => (
                <div
                  key={page}
                  ref={(node) => {
                    pageRefs.current[page] = node;
                  }}
                  className="continuous-item"
                >
                  <PdfCanvas doc={doc} pageNumber={page} scale={scale} className="viewer-page" />
                  <p className="meta">第 {page} / {totalPages} 页</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {showJumpDialog && (
          <div className="overlay" onClick={() => setShowJumpDialog(false)}>
            <div className="floating-panel" onClick={(event) => event.stopPropagation()}>
              <h3>跳转页码</h3>
              <div className="controls">
                <input
                  className="jump-input"
                  value={jumpInput}
                  onChange={(event) => setJumpInput(event.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      jumpToPage(Number(jumpInput || "1"));
                      setShowJumpDialog(false);
                    }
                  }}
                />
                <button
                  className="icon-btn"
                  onClick={() => {
                    jumpToPage(Number(jumpInput || "1"));
                    setShowJumpDialog(false);
                  }}
                  title="确认跳页"
                  aria-label="确认跳页"
                >
                  ✓
                </button>
              </div>
            </div>
          </div>
        )}

        {showSearchDialog && (
          <div className="overlay" onClick={() => setShowSearchDialog(false)}>
            <div className="floating-panel" onClick={(event) => event.stopPropagation()}>
              <h3>全文搜索</h3>
              <div className="controls">
                <input
                  className="search-input"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="输入关键词全文搜索"
                  disabled={!doc || searching}
                />
                <button
                  className="icon-btn"
                  disabled={!doc || searching}
                  onClick={runSearch}
                  title={searching ? "搜索中" : "执行搜索"}
                  aria-label={searching ? "搜索中" : "执行搜索"}
                >
                  {searching ? "…" : "⌕"}
                </button>
              </div>
              <p className="meta">命中页: {searchResults.length > 0 ? searchResults.join(", ") : "无"}</p>
            </div>
          </div>
        )}

        {showBookmarkDialog && (
          <div className="overlay" onClick={() => setShowBookmarkDialog(false)}>
            <div className="floating-panel" onClick={(event) => event.stopPropagation()}>
              <h3>书签</h3>
              {bookmarks.length === 0 && <p className="meta">暂无书签</p>}
              <div className="floating-list">
                {bookmarks.map((item) => (
                  <button
                    key={item.id}
                    className="outline-item"
                    onClick={() => {
                      jumpToPage(item.page);
                      setShowBookmarkDialog(false);
                    }}
                  >
                    第 {item.page} 页
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showOutlineDialog && (
          <div className="overlay" onClick={() => setShowOutlineDialog(false)}>
            <div className="floating-panel" onClick={(event) => event.stopPropagation()}>
              <h3>目录</h3>
              {outlineItems.length === 0 && <p className="meta">无目录</p>}
              <div className="floating-list">
                {outlineItems.map((item, index) => (
                  <button
                    key={`${item.title}-${index}`}
                    className="outline-item"
                    style={{ paddingLeft: `${10 + item.depth * 12}px` }}
                    disabled={!item.pageNumber}
                    onClick={() => {
                      if (item.pageNumber) {
                        jumpToPage(item.pageNumber);
                        setShowOutlineDialog(false);
                      }
                    }}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {shouldShowNextBookFab && (
          <button className="next-book-fab" onClick={() => onOpenBook(nextBook.id)} title={`下一本: ${nextBook.title}`}>
            下一本
          </button>
        )}
      </section>
    </div>
  );
}
