/**
 * Converte o GIF do motion em MP4 no navegador, porque o Instagram e o
 * OxyPlanning não aceitam GIF. Toca o loop num canvas 1080×1350 até somar
 * pelo menos `minSeconds` e grava com o MediaRecorder em MP4 (H.264).
 * Funciona no Chrome, Edge e Safari recentes. Sem suporte a MP4, lança um
 * erro claro e o Studio mantém só o GIF.
 */
type DecodedFrame = { bitmap: CanvasImageSource; ms: number; close?: () => void };

const MP4_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'];

export function mp4Supported() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    MP4_TYPES.some((t) => MediaRecorder.isTypeSupported(t))
  );
}

async function decodeWithImageDecoder(data: ArrayBuffer, fallbackMs: number): Promise<DecodedFrame[] | null> {
  const Decoder = (globalThis as unknown as { ImageDecoder?: new (init: { data: ArrayBuffer; type: string }) => {
    tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } };
    decode: (o: { frameIndex: number }) => Promise<{ image: VideoFrame }>;
    close: () => void;
  } & { isTypeSupported?: (t: string) => Promise<boolean> } }).ImageDecoder;
  if (!Decoder) return null;
  try {
    const decoder = new Decoder({ data, type: 'image/gif' });
    await decoder.tracks.ready;
    const count = decoder.tracks.selectedTrack?.frameCount || 0;
    if (!count) return null;
    const frames: DecodedFrame[] = [];
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const ms = image.duration ? image.duration / 1000 : fallbackMs;
      frames.push({ bitmap: image, ms: ms || fallbackMs, close: () => image.close() });
    }
    decoder.close();
    return frames;
  } catch {
    return null;
  }
}

export async function gifToMp4(gifUrl: string, opts: { frameMs: number; minSeconds?: number; width?: number; height?: number }) {
  if (!mp4Supported()) throw new Error('Este navegador não grava MP4. Abra o OxyCreate no Chrome, Edge ou Safari para converter o motion.');
  const width = opts.width || 1080;
  const height = opts.height || 1350;
  const minMs = (opts.minSeconds || 6) * 1000;
  const response = await fetch(gifUrl);
  if (!response.ok) throw new Error('Não foi possível abrir o GIF do motion.');
  const data = await response.arrayBuffer();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  const draw = (img: CanvasImageSource, w: number, h: number) => {
    // Cobre o quadro 4:5 sem distorcer.
    const scale = Math.max(width / w, height / h);
    const dw = w * scale;
    const dh = h * scale;
    ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
  };

  const frames = await decodeWithImageDecoder(data, opts.frameMs);
  // Sem ImageDecoder: o próprio navegador anima o GIF num <img> visível (1 px).
  let img: HTMLImageElement | null = null;
  if (!frames) {
    img = document.createElement('img');
    img.src = URL.createObjectURL(new Blob([data], { type: 'image/gif' }));
    img.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    document.body.appendChild(img);
    await img.decode();
  }

  const type = MP4_TYPES.find((t) => MediaRecorder.isTypeSupported(t))!;
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    recorder.start(250);
    if (frames) {
      const loopMs = frames.reduce((s, f) => s + f.ms, 0) || 1;
      const loops = Math.max(2, Math.ceil(minMs / loopMs));
      for (let l = 0; l < loops; l++)
        for (const f of frames) {
          const source = f.bitmap as VideoFrame;
          draw(f.bitmap, source.displayWidth || width, source.displayHeight || height);
          await wait(f.ms);
        }
    } else if (img) {
      const end = performance.now() + minMs;
      while (performance.now() < end) {
        draw(img, img.naturalWidth, img.naturalHeight);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    }
    recorder.stop();
    await stopped;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    frames?.forEach((f) => f.close?.());
    if (img) {
      URL.revokeObjectURL(img.src);
      img.remove();
    }
  }
  const blob = new Blob(chunks, { type: 'video/mp4' });
  if (!blob.size) throw new Error('A conversão para MP4 não gerou vídeo. Tente de novo no Chrome ou no Safari.');
  return new File([blob], 'motion.mp4', { type: 'video/mp4' });
}
