import { useEffect, useMemo, useRef, useState } from "react";
import {
  createFolder,
  deleteBook,
  deleteFolder,
  importBooks,
  listBooks,
  listFolders,
  moveBooksToFolder,
  type StoredBookMeta,
  type StoredFolder
} from "./libraryStore";
import { THEME_OPTIONS, type ThemeId } from "../../theme";

type Props = {
  onOpenBook: (bookId: string) => void;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

export function BookshelfPage({ onOpenBook, theme, onThemeChange }: Props) {
  const PAGE_SIZE = 20;
  const [books, setBooks] = useState<StoredBookMeta[]>([]);
  const [folders, setFolders] = useState<StoredFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [moveFolderId, setMoveFolderId] = useState<string>("unfiled");
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dirInputRef = useRef<HTMLInputElement | null>(null);

  const filteredBooks = useMemo(() => {
    if (activeFolderId === "all") {
      return books;
    }
    if (activeFolderId === "unfiled") {
      return books.filter((book) => !book.folderId);
    }
    return books.filter((book) => book.folderId === activeFolderId);
  }, [activeFolderId, books]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredBooks.length / PAGE_SIZE)), [filteredBooks.length]);
  const pageBooks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBooks.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredBooks]);
  const countText = useMemo(
    () => `${activeFolderId === "all" ? "全部" : "当前文件夹"} ${filteredBooks.length} 本 / 总共 ${books.length} 本`,
    [activeFolderId, filteredBooks.length, books.length]
  );
  const allSelected =
    pageBooks.length > 0 && pageBooks.every((book) => selectedIds.includes(book.id));

  async function refresh() {
    setLoading(true);
    try {
      const [bookResult, folderResult] = await Promise.all([listBooks(), listFolders()]);
      setBooks(bookResult);
      setFolders(folderResult);
      setSelectedIds((prev) => prev.filter((id) => bookResult.some((book) => book.id === id)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleImport(files: FileList | null) {
    if (!files) {
      return;
    }

    setBusy(true);
    try {
      await importBooks(Array.from(files));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFolderId]);

  function toggleSelect(bookId: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(bookId) ? prev : [...prev, bookId];
      }
      return prev.filter((id) => id !== bookId);
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      const pageIds = new Set(pageBooks.map((book) => book.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const book of pageBooks) {
        next.add(book.id);
      }
      return Array.from(next);
    });
  }

  async function removeSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => deleteBook(id)));
      setSelectedIds([]);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createNewFolder() {
    const name = newFolderName.trim();
    if (!name) {
      return;
    }
    setBusy(true);
    try {
      const folder = await createFolder(name);
      setNewFolderName("");
      setActiveFolderId(folder.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function moveSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await moveBooksToFolder(selectedIds, moveFolderId === "unfiled" ? null : moveFolderId);
      setSelectedIds([]);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeActiveFolder() {
    if (activeFolderId === "all" || activeFolderId === "unfiled") {
      return;
    }
    setBusy(true);
    try {
      await deleteFolder(activeFolderId);
      setActiveFolderId("all");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="header shelf-header">
        <div>
          <h1>我的书架</h1>
          <p>仅在浏览器本地建立索引与缓存，不会上传到服务器。</p>
        </div>
        <div className="shelf-actions">
          <select value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeId)} title="阅读主题">
            {THEME_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                主题: {item.label}
              </option>
            ))}
          </select>
          <button onClick={() => fileInputRef.current?.click()} disabled={busy}>
            + 导入 PDF
          </button>
          <button onClick={() => dirInputRef.current?.click()} disabled={busy}>
            + 导入目录
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="application/pdf"
            multiple
            onChange={(event) => handleImport(event.target.files)}
          />
          <input
            ref={dirInputRef}
            hidden
            type="file"
            multiple
            onChange={(event) => handleImport(event.target.files)}
            {...({ webkitdirectory: "" } as unknown as Record<string, string>)}
          />
        </div>
      </header>

      <section className="card shelf-card">
        <div className="folder-bar">
          <button className={activeFolderId === "all" ? "is-active" : ""} onClick={() => setActiveFolderId("all")}>
            全部
          </button>
          <button className={activeFolderId === "unfiled" ? "is-active" : ""} onClick={() => setActiveFolderId("unfiled")}>
            未分类
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              className={activeFolderId === folder.id ? "is-active" : ""}
              onClick={() => setActiveFolderId(folder.id)}
            >
              {folder.name}
            </button>
          ))}
        </div>

        <div className="folder-create">
          <input
            type="text"
            value={newFolderName}
            placeholder="新建文件夹名称"
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                createNewFolder();
              }
            }}
          />
          <button disabled={busy || !newFolderName.trim()} onClick={createNewFolder}>
            新建文件夹
          </button>
          <button
            className="danger"
            disabled={busy || activeFolderId === "all" || activeFolderId === "unfiled"}
            onClick={removeActiveFolder}
          >
            删除当前文件夹
          </button>
        </div>

        <div className="shelf-tools">
          <div className="shelf-meta">{busy ? "正在导入..." : countText}</div>
          <div className="shelf-select-tools">
            <select value={moveFolderId} onChange={(event) => setMoveFolderId(event.target.value)} disabled={busy}>
              <option value="unfiled">移动到未分类</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  移动到 {folder.name}
                </option>
              ))}
            </select>
            <button onClick={moveSelected} disabled={selectedIds.length === 0 || busy}>
              移动选中 ({selectedIds.length})
            </button>
            <button onClick={toggleSelectAll} disabled={pageBooks.length === 0 || busy}>
              {allSelected ? "取消全选" : "全选"}
            </button>
            <button className="danger" onClick={removeSelected} disabled={selectedIds.length === 0 || busy}>
              移除选中 ({selectedIds.length})
            </button>
          </div>
        </div>

        {loading && <p className="meta">正在加载书架...</p>}

        {!loading && filteredBooks.length === 0 && (
          <p className="meta">书架为空。点击右上角“导入 PDF”或“导入目录”。</p>
        )}

        <div className="book-grid">
          {pageBooks.map((book) => (
            <article key={book.id} className="book-card">
              <label className="book-select">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(book.id)}
                  onChange={(event) => toggleSelect(book.id, event.target.checked)}
                />
                选择
              </label>
              <button className="book-cover" onClick={() => onOpenBook(book.id)}>
                <span className="book-cover-name">{book.title}</span>
                <span className="book-cover-sub">PDF</span>
              </button>
              <div className="book-info">
                <h3 title={book.fileName}>{book.title}</h3>
                <p className="meta">{formatSize(book.size)}</p>
                <p className="meta">上次阅读: 第 {book.lastPage} 页</p>
                <p className="meta">最近打开: {formatDate(book.lastOpenedAt)}</p>
              </div>
              <div className="book-actions">
                <button onClick={() => onOpenBook(book.id)}>继续阅读</button>
                <button
                  className="danger"
                  onClick={async () => {
                    await deleteBook(book.id);
                    await refresh();
                  }}
                >
                  移除
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="pagination">
          <button disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
            上一页
          </button>
          <span className="meta">
            第 {currentPage} / {totalPages} 页
          </span>
          <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
            下一页
          </button>
        </div>
      </section>
    </main>
  );
}
