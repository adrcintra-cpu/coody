import { authorize } from '@/lib/auth';
import { bucket, database } from '@/lib/repository';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  const asset = await database()
    .prepare('SELECT * FROM brand_assets WHERE id=?')
    .bind(id)
    .first<{ brandId: string; mime: string; name: string }>();
  if (!asset) return new Response('Arquivo não encontrado', { status: 404 });
  const object = await bucket().get(`brands/${asset.brandId}/${id}`);
  if (!object) return new Response('Arquivo não encontrado', { status: 404 });
  const ext:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/svg+xml':'.svg','application/pdf':'.pdf'};
  const filename=/\.(png|jpe?g|webp|svg|pdf)$/i.test(asset.name)?asset.name:asset.name+(ext[asset.mime]||'');
  const download=new URL(request.url).searchParams.get('download')==='1';
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.mime,
      'Content-Disposition': `${download || asset.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
