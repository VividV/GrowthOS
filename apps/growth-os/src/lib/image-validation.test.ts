import { describe, expect, it } from "vitest";
import { validateImage } from "./image-validation";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("image upload validation", () => {
  it("accepts PNG, JPEG and WebP by magic bytes", () => {
    expect(validateImage(png, 100)).toMatchObject({ ok: true, kind: { ext: "png" } });
    expect(validateImage(jpg, 100)).toMatchObject({ ok: true, kind: { ext: "jpg" } });
    expect(validateImage(webp, 100)).toMatchObject({ ok: true, kind: { ext: "webp" } });
  });
  it("rejects SVG, executables, empty and oversized files", () => {
    expect(validateImage(svg, svg.length).ok).toBe(false);
    expect(validateImage(exe, 100).ok).toBe(false);
    expect(validateImage(png, 0).ok).toBe(false);
    expect(validateImage(png, 3 * 1024 * 1024).ok).toBe(false);
  });
});
