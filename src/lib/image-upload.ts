import { supabase } from "@/integrations/supabase/client";

const MAX_EDGE = 1920;
const QUALITY = 0.8;
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10; // 10 năm

function isHeic(file: File) {
  const n = file.name.toLowerCase();
  return file.type === "image/heic" || file.type === "image/heif" || n.endsWith(".heic") || n.endsWith(".heif");
}

async function loadBitmap(blob: Blob): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(blob);
    return { w: bmp.width, h: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), done: () => bmp.close?.() };
  }
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image();
    el.onload = () => res(el);
    el.onerror = () => rej(new Error("Không đọc được ảnh"));
    el.src = url;
  });
  return { w: img.naturalWidth, h: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), done: () => URL.revokeObjectURL(url) };
}

/** Chuyển HEIC→JPEG (nếu cần), resize cạnh lớn nhất ≤1920px và nén ~80% */
export async function optimizeImage(file: File): Promise<Blob> {
  let source: Blob = file;
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default as any;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: QUALITY });
    source = Array.isArray(out) ? out[0] : out;
  }

  const { w, h, draw, done } = await loadBitmap(source);
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    done();
    return source;
  }
  ctx.drawImage as unknown;
  draw(ctx, tw, th);
  done();

  const type = typeof canvas.toDataURL === "function" && canvas.toDataURL("image/webp").startsWith("data:image/webp")
    ? "image/webp"
    : "image/jpeg";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, QUALITY));
  return blob ?? source;
}

/** Upload 1 ảnh đã tối ưu lên bucket learning-media, trả về URL có chữ ký dùng lâu dài */
export async function uploadLearningImage(file: File): Promise<string> {
  const blob = await optimizeImage(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("learning-media").upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data, error: signErr } = await supabase.storage.from("learning-media").createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !data?.signedUrl) throw new Error(signErr?.message ?? "Không tạo được liên kết ảnh");
  return data.signedUrl;
}
