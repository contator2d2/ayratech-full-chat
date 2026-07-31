import JSZip from 'jszip';
import { resolveMediaUrl } from '@/lib/media';

export interface ExportablePhoto {
  id: string;
  photo_url: string;
  rotation?: number | null;
  photo_type?: string | null;
  pdv_name?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  product_name?: string | null;
  promoter_name?: string | null;
  captured_at?: string | null;
}

function sanitize(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function buildFileName(p: ExportablePhoto, index: number): string {
  const date = p.captured_at ? String(p.captured_at).slice(0, 10) : 'sem-data';
  const parts = [
    date,
    sanitize(p.pdv_name || ''),
    sanitize(p.brand_name || ''),
    sanitize(p.category_name || p.product_name || ''),
    sanitize(p.photo_type || ''),
  ].filter(Boolean);
  return `${String(index + 1).padStart(3, '0')}_${parts.join('_') || 'foto'}.jpg`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load-error'));
    img.src = src;
  });
}

/** Converte qualquer imagem (webp/png/…) para JPEG, aplicando a rotação salva. */
export async function photoToJpegBlob(photo: ExportablePhoto, quality = 0.92): Promise<Blob | null> {
  const url = resolveMediaUrl(photo.photo_url);
  if (!url) return null;
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    // fallback: tenta via fetch → objectURL (contorna alguns casos de CORS/cache)
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      img = await loadImage(objUrl);
      URL.revokeObjectURL(objUrl);
    } catch {
      return null;
    }
  }

  const rot = ((photo.rotation || 0) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Baixa uma única foto convertida em JPG. */
export async function downloadPhotoAsJpg(photo: ExportablePhoto): Promise<boolean> {
  const blob = await photoToJpegBlob(photo);
  if (!blob) return false;
  triggerDownload(blob, buildFileName(photo, 0));
  return true;
}

/**
 * Exporta várias fotos em JPG. 1 foto → download direto; várias → ZIP.
 * onProgress(done, total) para feedback na UI.
 */
export async function exportPhotosAsJpg(
  photos: ExportablePhoto[],
  opts: { zipName?: string; onProgress?: (done: number, total: number) => void } = {}
): Promise<{ ok: number; failed: number }> {
  const list = photos.filter((p) => resolveMediaUrl(p.photo_url));
  if (list.length === 0) return { ok: 0, failed: photos.length };

  if (list.length === 1) {
    const ok = await downloadPhotoAsJpg(list[0]);
    opts.onProgress?.(1, 1);
    return { ok: ok ? 1 : 0, failed: ok ? 0 : 1 };
  }

  const zip = new JSZip();
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i++) {
    const blob = await photoToJpegBlob(list[i]);
    if (blob) {
      zip.file(buildFileName(list[i], i), blob);
      ok++;
    } else {
      failed++;
    }
    opts.onProgress?.(i + 1, list.length);
  }
  if (ok === 0) return { ok: 0, failed };
  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `${opts.zipName || 'fotos'}.zip`);
  return { ok, failed };
}

/** Fotos que realmente podem ser exibidas (ignora blob:/local-file: pendentes de sincronismo). */
export function countViewablePhotos(photos: Array<{ photo_url?: string | null }>): number {
  return photos.filter((p) => !!resolveMediaUrl(p.photo_url || '')).length;
}
