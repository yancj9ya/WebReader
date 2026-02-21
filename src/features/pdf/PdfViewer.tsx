import { useCallback, useEffect, useMemo, useState } from "react";
import { openPdfFromFile } from "./usePdfDocument";
import { fingerprintFile } from "../../utils/fileFingerprint";
import { loadProgress, saveProgress } from "../progress/progressStore";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Props = {
  file: File | null;
};

type OutlineItem = {
  depth: number;
  pageNumber: number | null;
  title: string;
};

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

export function PdfViewer({ file }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [error, setError] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [jumpInput, setJumpInput] = useState("1");
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!file) {
        setDoc(null);
        setPageNumber(1);
        setTotalPages(0);
        setFileKey(null);
        setJumpInput("1");
        setOutlineItems([]);
        setSearchResults([]);
        setSearchInput("");
        setError(null);
        return;
      }

      try {
        setError(null);
        setSearchResults([]);
        const [loadedDoc, key] = await Promise.all([openPdfFromFile(file), fingerprintFile(file)]);
        const outline = await collectOutline(loadedDoc);

        if (cancelled) {
          return;
        }

        const savedPage = loadProgress(key);
        const safePage = Math.min(Math.max(savedPage, 1), loadedDoc.numPages);
        setDoc(loadedDoc);
        setTotalPages(loadedDoc.numPages);
        setPageNumber(safePage);
        setJumpInput(String(safePage));
        setFileKey(key);
        setOutlineItems(outline);
      } catch {
        if (!cancelled) {
          setDoc(null);
          setTotalPages(0);
          setPageNumber(1);
          setFileKey(null);
          setOutlineItems([]);
          setSearchResults([]);
          setError("无法读取该 PDF 文件，请确认文件未损坏或未加密。");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const canRead = useMemo(() => !!doc, [doc]);

  useEffect(() => {
    if (fileKey && canRead) {
      saveProgress(fileKey, pageNumber);
    }
    setJumpInput(String(pageNumber));
  }, [fileKey, canRead, pageNumber]);

  const canvasRef = useCallback(
    async (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !doc) {
        return;
      }

      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport
      }).promise;
    },
    [doc, pageNumber, scale]
  );

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

  function jumpToPage(next: number) {
    if (!doc) {
      return;
    }

    const safe = Math.min(Math.max(next, 1), doc.numPages);
    setPageNumber(safe);
  }

  return (
    <div className="card">
      <div className="controls">
        <button disabled={!canRead || pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}>
          上一页
        </button>
        <button disabled={!canRead || pageNumber >= totalPages} onClick={() => setPageNumber((p) => p + 1)}>
          下一页
        </button>
        <button disabled={!canRead} onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.1).toFixed(2))))}>
          缩小
        </button>
        <button disabled={!canRead} onClick={() => setScale((s) => Math.min(3, Number((s + 0.1).toFixed(2))))}>
          放大
        </button>
        <label className="jump-label">
          跳页
          <input
            className="jump-input"
            value={jumpInput}
            onChange={(event) => setJumpInput(event.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                jumpToPage(Number(jumpInput || "1"));
              }
            }}
            disabled={!canRead}
          />
        </label>
        <button disabled={!canRead} onClick={() => jumpToPage(Number(jumpInput || "1"))}>
          跳转
        </button>
        <span className="meta">
          页码: {canRead ? pageNumber : 0} / {totalPages} | 缩放: {Math.round(scale * 100)}%
        </span>
      </div>

      <div className="controls">
        <input
          className="search-input"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="输入关键词全文搜索"
          disabled={!canRead || searching}
        />
        <button disabled={!canRead || searching} onClick={runSearch}>
          {searching ? "搜索中..." : "搜索"}
        </button>
        <span className="meta">
          匹配页: {searchResults.length > 0 ? searchResults.join(", ") : "无"}
        </span>
      </div>

      {error && <p className="warn">{error}</p>}

      {!file && <p className="meta">请先导入本地 PDF 文件。</p>}

      {file && canRead && (
        <div className="reader-layout">
          <aside className="outline-panel">
            <h3>目录</h3>
            {outlineItems.length === 0 && <p className="meta">当前 PDF 无可用目录。</p>}
            {outlineItems.map((item, index) => (
              <button
                key={`${item.title}-${index}`}
                className="outline-item"
                style={{ paddingLeft: `${10 + item.depth * 14}px` }}
                disabled={!item.pageNumber}
                onClick={() => {
                  if (item.pageNumber) {
                    setPageNumber(item.pageNumber);
                  }
                }}
              >
                {item.title}
              </button>
            ))}
          </aside>

          <div className="viewer-wrap">
            <canvas ref={canvasRef} className="viewer-page" />
          </div>
        </div>
      )}
    </div>
  );
}
