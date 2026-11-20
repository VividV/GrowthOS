/**
 * Upload validation by content, not by the client-supplied MIME type or name.
 * Only PNG, JPEG and WebP are accepted (no SVG: it can carry scripts).
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageKind = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export function validateImage(bytes: Uint8Array, size: number): { ok: true; kind: ImageKind } | { ok: false; error: string } {
  if (size === 0) return { ok: false, error: "The file is empty." };
  if (size > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be 2 MB or smaller." };
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, error: "Upload a PNG, JPEG or WebP image." };
  return { ok: true, kind };
}
