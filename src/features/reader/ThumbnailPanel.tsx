import { useEffect, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfCanvas } from "./PdfCanvas";

type Props = {
  doc: PDFDocumentProxy;
  totalPages: number;
  currentPage: number;
  collapsed: boolean;
  onToggle: () => void;
  onJump: (page: number) => void;
};

export function ThumbnailPanel({ doc, totalPages, currentPage, collapsed, onToggle, onJump }: Props) {
  const [limit, setLimit] = useState(24);

  useEffect(() => {
    setLimit(24);
  }, [doc]);

  const pages = useMemo(() => Array.from({ length: Math.min(totalPages, limit) }, (_, i) => i + 1), [totalPages, limit]);

  if (collapsed) {
    return (
      <aside className="thumb-collapsed">
        <button onClick={onToggle}>展开预览</button>
      </aside>
    );
  }

  return (
    <aside className="thumb-panel">
      <div className="thumb-head">
        <h3>页面预览</h3>
        <button onClick={onToggle}>收起</button>
      </div>
      <div className="thumb-list">
        {pages.map((page) => (
          <button
            key={page}
            className={`thumb-item ${page === currentPage ? "active" : ""}`}
            onClick={() => onJump(page)}
          >
            <PdfCanvas doc={doc} pageNumber={page} scale={0.22} className="thumb-canvas" />
            <span>第 {page} 页</span>
          </button>
        ))}
      </div>
      {limit < totalPages && (
        <button className="thumb-more" onClick={() => setLimit((v) => Math.min(totalPages, v + 24))}>
          加载更多
        </button>
      )}
    </aside>
  );
}
