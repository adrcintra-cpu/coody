'use client';
/**
 * Renders the Story canvas (1080 × 1920) from the shared source art, in the
 * browser. The source is kept whole and centered — same image, texts,
 * identity and hierarchy — over a soft background made from the same image.
 * Blur is produced by downscaling, so it works in every browser (Safari does
 * not support CanvasRenderingContext2D.filter).
 */
const W = 1080;
const H = 1920;

async function loadImage(src: string) {
  const response = await fetch(src, { cache: 'force-cache' });
  if (!response.ok) throw new Error('Não foi possível ler a arte de origem.');
  const url = URL.createObjectURL(await response.blob());
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      img,
      width: img.naturalWidth || 1080,
      height: img.naturalHeight || 1350,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function renderStoryAdaptation(sourceUrl: string): Promise<Blob> {
  const { img, width, height, release } = await loadImage(sourceUrl);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Seu navegador não permite gerar o Story.');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // Background: the same image, covering the canvas, heavily softened.
    const small = document.createElement('canvas');
    small.width = 27;
    small.height = 48;
    const s = small.getContext('2d')!;
    const cover = Math.max(small.width / width, small.height / height);
    s.drawImage(
      img,
      (small.width - width * cover) / 2,
      (small.height - height * cover) / 2,
      width * cover,
      height * cover,
    );
    const mid = document.createElement('canvas');
    mid.width = 135;
    mid.height = 240;
    mid.getContext('2d')!.drawImage(small, 0, 0, mid.width, mid.height);
    g.drawImage(mid, 0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.fillRect(0, 0, W, H);
    // Foreground: the whole source art, centered, inside the safe area.
    const scale = Math.min(W / width, (H * 0.86) / height);
    const w = width * scale;
    const h = height * scale;
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar o Story.'))),
        'image/jpeg',
        0.92,
      ),
    );
  } finally {
    release();
  }
}

export async function saveStoryAdaptation(sourceUrl: string) {
  const blob = await renderStoryAdaptation(sourceUrl);
  const form = new FormData();
  form.append('sourceUrl', sourceUrl);
  form.append(
    'file',
    new File([blob], 'story-1080x1920.jpg', { type: 'image/jpeg' }),
  );
  const response = await fetch('/api/assets/story', {
    method: 'POST',
    body: form,
  });
  const result = (await response.json()) as { error?: string; url?: string };
  if (!response.ok || !result.url)
    throw new Error(result.error || 'Falha ao salvar o Story.');
  return result.url;
}
