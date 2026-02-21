export async function fingerprintFile(file: File): Promise<string> {
  const head = await file.slice(0, 64 * 1024).arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", head);
  const hashHex = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `${file.name}:${file.size}:${hashHex}`;
}
