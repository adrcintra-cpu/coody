export async function checkImageFile(file: File) {
  if (!file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error();
  } catch {
    throw new Error(
      'A imagem “' +
        file.name +
        '” não pode ser aberta. Exporte novamente antes de enviar.',
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Images over the upload limit are re-encoded in the browser (longest side up
 * to 2560 px, WEBP keeps transparency) until they fit. PDFs, SVGs and images
 * already within the limit are returned unchanged. Throws a message naming
 * the file when it still does not fit.
 */
export async function fitUpload(file: File, maxMB: number): Promise<File> {
  const max = maxMB * 1024 * 1024;
  if (file.size <= max) return file;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error(
      `“${file.name}” tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é ${maxMB} MB por arquivo; reduza o arquivo e envie de novo.`,
    );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`A imagem “${file.name}” não pode ser aberta. Exporte novamente antes de enviar.`);
  }
  const base = file.name.replace(/\.[a-z0-9]+$/i, '');
  for (const [side, quality] of [
    [2560, 0.9],
    [2560, 0.8],
    [2048, 0.8],
    [1600, 0.8],
    [1280, 0.75],
  ] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (blob && blob.type === 'image/webp' && blob.size <= max) {
      bitmap.close();
      return new File([blob], base + '.webp', { type: 'image/webp' });
    }
  }
  bitmap.close();
  throw new Error(
    `Não foi possível reduzir “${file.name}” para ${maxMB} MB. Exporte uma versão menor e envie de novo.`,
  );
}
