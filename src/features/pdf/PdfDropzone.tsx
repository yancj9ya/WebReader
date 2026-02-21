type Props = {
  onFilePick: (file: File | null) => void;
};

export function PdfDropzone({ onFilePick }: Props) {
  return (
    <div
      className="dropzone"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const next = event.dataTransfer.files?.[0] ?? null;
        if (next && next.type === "application/pdf") {
          onFilePick(next);
        }
      }}
    >
      <p>拖拽 PDF 到这里，或点击选择文件</p>
      <input
        type="file"
        accept="application/pdf"
        onChange={(event) => onFilePick(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
