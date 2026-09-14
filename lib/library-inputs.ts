import { bucket } from './repository';
import { base64 } from './creative-materials';
import type { Asset } from './types';
export async function libraryInputs(materials: Asset[]) {
  const images: { asset: Asset; file: File }[] = [];
  const content: Record<string, unknown>[] = [];
  let total = 0;
  const supported = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
  ];
  if (materials.some((a) => !supported.includes(a.mime)))
    throw new Error(
      'Há um material em formato não suportado pela IA. Use PNG, JPG, WEBP ou PDF para os materiais de criação.',
    );
  if (materials.filter((a) => a.mime.startsWith('image/')).length > 16)
    throw new Error(
      'A biblioteca supera 16 imagens por geração. Organize as referências da marca antes de continuar.',
    );
  for (const asset of materials) {
    const object = await bucket().get(
      'brands/' + asset.brandId + '/' + asset.id,
    );
    if (!object)
      throw new Error('Arquivo da biblioteca indisponível: ' + asset.name);
    total += object.size;
    if (total > 24 * 1024 * 1024)
      throw new Error(
        'Os materiais superam 24 MB por geração. Reduza o tamanho dos arquivos da marca.',
      );
    const bytes = new Uint8Array(await object.arrayBuffer());
    content.push({
      type: 'input_text',
      text: JSON.stringify({
        arquivo: asset.name,
        categoria: asset.category,
        prioritario: asset.priority,
        aprovado: asset.approved,
        descricao: asset.description,
        orientacao: asset.aiNotes,
      }),
    });
    if (asset.mime === 'application/pdf')
      content.push({
        type: 'input_file',
        filename: asset.name.endsWith('.pdf')
          ? asset.name
          : asset.name + '.pdf',
        file_data: 'data:application/pdf;base64,' + base64(bytes),
      });
    else {
      images.push({
        asset,
        file: new File([bytes], asset.name, { type: asset.mime }),
      });
      content.push({
        type: 'input_image',
        image_url: 'data:' + asset.mime + ';base64,' + base64(bytes),
        detail: 'high',
      });
    }
  }
  return { images, content };
}
