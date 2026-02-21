import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Props = {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  className?: string;
};

export function PdfCanvas({ doc, pageNumber, scale, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const page = await doc.getPage(pageNumber);
      if (cancelled) {
        return;
      }

      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    }

    render();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, scale]);

  return <canvas ref={canvasRef} className={className} />;
}
