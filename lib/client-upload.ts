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
