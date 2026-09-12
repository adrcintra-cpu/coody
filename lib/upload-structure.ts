// Structural validation runs on the server before any object is stored.
export function validateFileStructure(bytes: ArrayBuffer, mime: string) {
  const b = new Uint8Array(bytes),
    v = new DataView(bytes);
  const fail = () => {
    throw new Error(
      'Arquivo incompleto ou inválido. Exporte novamente e tente enviar.',
    );
  };
  const text = (a: number, z: number) =>
    new TextDecoder().decode(b.subarray(a, z));
  if (mime === 'image/png') {
    if (
      b.length < 45 ||
      !b
        .subarray(0, 8)
        .every((x, i) => x === [137, 80, 78, 71, 13, 10, 26, 10][i])
    )
      fail();
    let p = 8,
      header = false,
      data = false,
      end = false;
    while (p + 12 <= b.length) {
      const n = v.getUint32(p);
      if (n > b.length - p - 12) fail();
      const type = text(p + 4, p + 8);
      if (!header) {
        if (
          type !== 'IHDR' ||
          n !== 13 ||
          !v.getUint32(p + 8) ||
          !v.getUint32(p + 12)
        )
          fail();
        header = true;
      }
      if (type === 'IDAT' && n > 0) data = true;
      if (type === 'IEND') {
        if (n !== 0 || p + 12 !== b.length) fail();
        end = true;
        break;
      }
      p += n + 12;
    }
    if (!header || !data || !end) fail();
  } else if (mime === 'image/jpeg') {
    if (
      b.length < 12 ||
      b[0] !== 255 ||
      b[1] !== 216 ||
      b[b.length - 2] !== 255 ||
      b[b.length - 1] !== 217
    )
      fail();
    let p = 2,
      frame = false,
      scan = false;
    while (p + 4 < b.length) {
      if (b[p++] !== 255) fail();
      while (b[p] === 255) p++;
      const marker = b[p++];
      if (marker === 217) break;
      const n = v.getUint16(p);
      if (n < 2 || p + n > b.length) fail();
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        if (n < 8 || !v.getUint16(p + 3) || !v.getUint16(p + 5)) fail();
        frame = true;
      }
      if (marker === 218) {
        scan = true;
        break;
      }
      p += n;
    }
    if (!frame || !scan) fail();
  } else if (mime === 'image/webp') {
    if (
      b.length < 20 ||
      text(0, 4) !== 'RIFF' ||
      text(8, 12) !== 'WEBP' ||
      v.getUint32(4, true) + 8 !== b.length
    )
      fail();
    let p = 12,
      data = false;
    while (p + 8 <= b.length) {
      const n = v.getUint32(p + 4, true),
        type = text(p, p + 4);
      if (n > b.length - p - 8) fail();
      if (['VP8 ', 'VP8L', 'ANMF'].includes(type) && n > 4) data = true;
      p += 8 + n + (n % 2);
    }
    if (!data || p !== b.length) fail();
  } else if (mime === 'application/pdf') {
    if (
      !text(0, 8).startsWith('%PDF-') ||
      !text(Math.max(0, b.length - 2048), b.length).includes('%%EOF')
    )
      fail();
  }
}
