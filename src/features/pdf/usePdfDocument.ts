import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

export async function openPdfFromFile(file: File) {
  const data = await file.arrayBuffer();
  const task = getDocument({ data });
  return task.promise;
}

export async function openPdfFromData(data: ArrayBuffer) {
  const task = getDocument({ data });
  return task.promise;
}
