import { fingerprintFile } from "../../utils/fileFingerprint";

const DB_NAME = "local_pdf_reader";
const DB_VERSION = 2;
const BOOK_STORE = "books";
const BOOKMARK_STORE = "bookmarks";
const FOLDER_STORE = "folders";

export type StoredBook = {
  id: string;
  title: string;
  fileName: string;
  size: number;
  addedAt: number;
  lastOpenedAt: number;
  lastPage: number;
  totalPages: number;
  folderId: string | null;
  pdfData: ArrayBuffer;
};

export type StoredBookMeta = Omit<StoredBook, "pdfData">;

export type StoredBookmark = {
  id: string;
  bookId: string;
  page: number;
  label: string;
  createdAt: number;
};

export type StoredFolder = {
  id: string;
  name: string;
  createdAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        const store = db.createObjectStore(BOOK_STORE, { keyPath: "id" });
        store.createIndex("folderId", "folderId", { unique: false });
      } else {
        const store = request.transaction?.objectStore(BOOK_STORE);
        if (store && !store.indexNames.contains("folderId")) {
          store.createIndex("folderId", "folderId", { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(BOOKMARK_STORE)) {
        const store = db.createObjectStore(BOOKMARK_STORE, { keyPath: "id" });
        store.createIndex("bookId", "bookId", { unique: false });
      }
      if (!db.objectStoreNames.contains(FOLDER_STORE)) {
        db.createObjectStore(FOLDER_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });

  return dbPromise;
}

function asMeta(book: StoredBook): StoredBookMeta {
  const { pdfData: _pdfData, ...meta } = book;
  return meta;
}

export async function listBooks(): Promise<StoredBookMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readonly");
    const request = tx.objectStore(BOOK_STORE).getAll();

    request.onsuccess = () => {
      const items = (request.result as StoredBook[])
        .map(asMeta)
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || b.addedAt - a.addedAt);
      resolve(items);
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to list books"));
  });
}

export async function getBook(bookId: string): Promise<StoredBook | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readonly");
    const request = tx.objectStore(BOOK_STORE).get(bookId);

    request.onsuccess = () => resolve((request.result as StoredBook | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Failed to load book"));
  });
}

export async function importBooks(files: File[]): Promise<StoredBookMeta[]> {
  const pdfFiles = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  if (pdfFiles.length === 0) {
    return [];
  }

  const now = Date.now();
  const db = await openDb();

  const books = await Promise.all(
    pdfFiles.map(async (file) => {
      const id = await fingerprintFile(file);
      const existing = await getBook(id);
      const data = await file.arrayBuffer();
      return {
        id,
        title: file.name.replace(/\.pdf$/i, ""),
        fileName: file.name,
        size: file.size,
        addedAt: existing?.addedAt ?? now,
        lastOpenedAt: existing?.lastOpenedAt ?? now,
        lastPage: existing?.lastPage ?? 1,
        totalPages: existing?.totalPages ?? 0,
        folderId: existing?.folderId ?? null,
        pdfData: data
      } satisfies StoredBook;
    })
  );

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readwrite");
    const store = tx.objectStore(BOOK_STORE);
    for (const book of books) {
      store.put(book);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save books"));
  });

  return books.map(asMeta);
}

export async function listFolders(): Promise<StoredFolder[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_STORE, "readonly");
    const request = tx.objectStore(FOLDER_STORE).getAll();

    request.onsuccess = () => {
      const items = (request.result as StoredFolder[]).sort((a, b) => a.createdAt - b.createdAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to list folders"));
  });
}

export async function createFolder(name: string): Promise<StoredFolder> {
  const clean = name.trim();
  if (!clean) {
    throw new Error("Folder name is empty");
  }

  const folder: StoredFolder = {
    id: `folder:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`,
    name: clean,
    createdAt: Date.now()
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDER_STORE, "readwrite");
    tx.objectStore(FOLDER_STORE).put(folder);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to create folder"));
  });

  return folder;
}

export async function moveBooksToFolder(bookIds: string[], folderId: string | null): Promise<void> {
  if (bookIds.length === 0) {
    return;
  }

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readwrite");
    const store = tx.objectStore(BOOK_STORE);

    for (const bookId of bookIds) {
      const request = store.get(bookId);
      request.onsuccess = () => {
        const found = request.result as StoredBook | undefined;
        if (!found) {
          return;
        }
        store.put({
          ...found,
          folderId
        } satisfies StoredBook);
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to move books"));
  });
}

export async function deleteFolder(folderId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([FOLDER_STORE, BOOK_STORE], "readwrite");
    tx.objectStore(FOLDER_STORE).delete(folderId);

    const store = tx.objectStore(BOOK_STORE);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      const value = cursor.value as StoredBook;
      if (value.folderId === folderId) {
        cursor.update({
          ...value,
          folderId: null
        } satisfies StoredBook);
      }
      cursor.continue();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete folder"));
  });
}

export async function deleteBook(bookId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BOOK_STORE, BOOKMARK_STORE], "readwrite");
    tx.objectStore(BOOK_STORE).delete(bookId);

    const index = tx.objectStore(BOOKMARK_STORE).index("bookId");
    const request = index.openCursor(IDBKeyRange.only(bookId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete book"));
  });
}

export async function updateBookReading(bookId: string, page: number, totalPages: number): Promise<void> {
  const book = await getBook(bookId);
  if (!book) {
    return;
  }

  const next: StoredBook = {
    ...book,
    lastPage: page,
    totalPages,
    lastOpenedAt: Date.now()
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readwrite");
    tx.objectStore(BOOK_STORE).put(next);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to update reading progress"));
  });
}

export async function listBookmarks(bookId: string): Promise<StoredBookmark[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKMARK_STORE, "readonly");
    const index = tx.objectStore(BOOKMARK_STORE).index("bookId");
    const request = index.getAll(IDBKeyRange.only(bookId));

    request.onsuccess = () => {
      const items = (request.result as StoredBookmark[]).sort((a, b) => a.page - b.page);
      resolve(items);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to list bookmarks"));
  });
}

export async function toggleBookmark(bookId: string, page: number): Promise<void> {
  const db = await openDb();
  const id = `${bookId}:${page}`;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOKMARK_STORE, "readwrite");
    const store = tx.objectStore(BOOKMARK_STORE);
    const checkRequest = store.get(id);

    checkRequest.onsuccess = () => {
      if (checkRequest.result) {
        store.delete(id);
      } else {
        store.put({
          id,
          bookId,
          page,
          label: `第 ${page} 页`,
          createdAt: Date.now()
        } satisfies StoredBookmark);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to toggle bookmark"));
  });
}
