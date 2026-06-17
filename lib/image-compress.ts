/**
 * Client-side image compression — runs before every upload in the app.
 *
 * Resizes so the longest edge is <= maxDimension (never upscales) and re-encodes
 * to WebP at a quality target. Dependency-free (browser Canvas API). Re-encoding
 * also strips EXIF/GPS metadata, which is a privacy win.
 *
 * Defensive by design: on any failure, or if the result isn't smaller than the
 * original, it returns the original File unchanged — an upload must never break
 * because compression failed.
 */

export interface CompressOptions {
  maxDimension?: number; // longest edge in px
  quality?: number; // 0..1
  mimeType?: string; // output type
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 1600,
  quality: 0.8,
  mimeType: "image/webp",
};

// Files at/below this are left alone — not worth the work.
const SKIP_BELOW_BYTES = 50 * 1024;

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDimension, quality, mimeType } = { ...DEFAULTS, ...opts };

  // Only process raster images; skip GIF (animation would be lost) and tiny files.
  if (
    typeof window === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/gif" ||
    file.size <= SKIP_BELOW_BYTES
  ) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longest = Math.max(width, height);
    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, quality)
    );
    if (!blob || blob.size >= file.size) {
      // Compression didn't help (or failed) — keep the original.
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
    return new File([blob], `${baseName}.${ext}`, { type: mimeType, lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Maps compressImage over an array — use directly as Uploadthing's onBeforeUploadBegin. */
export async function compressFiles(files: File[], opts: CompressOptions = {}): Promise<File[]> {
  return Promise.all(files.map((f) => compressImage(f, opts)));
}
