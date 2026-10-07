import { authorize } from '@/lib/auth';
import { bucket, database } from '@/lib/repository';
import { allowedWorkspaceIds } from '@/lib/workspaces';
import { shareByToken } from '@/lib/share';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // A client link (?share=token) opens only files of its own brand.
  const shareToken = new URL(request.url).searchParams.get('share');
  const share = shareToken ? await shareByToken(shareToken).catch(() => null) : null;
  const user = share ? null : await authorize(request);
  if (user instanceof Response) return user;
  const asset = await database()
    .prepare('SELECT * FROM brand_assets WHERE id=?')
    .bind(id)
    .first<{ brandId: string; mime: string; name: string }>();
  if (!asset) return new Response('Arquivo não encontrado', { status: 404 });
  if (share && asset.brandId !== share.brandId)
    return new Response('Arquivo não encontrado', { status: 404 });
  // Invited people only open files of the workspaces released to them.
  const allowed = share ? null : await allowedWorkspaceIds(request).catch(() => [] as string[]);
  if (allowed) {
    const brand = await database()
      .prepare('SELECT workspaceId FROM brands WHERE id=?')
      .bind(asset.brandId)
      .first<{ workspaceId: string }>();
    if (!brand || !allowed.includes(brand.workspaceId))
      return new Response('Arquivo não encontrado', { status: 404 });
  }
  const object = await bucket().get(`brands/${asset.brandId}/${id}`);
  if (!object) return new Response('Arquivo não encontrado', { status: 404 });
  const ext:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/svg+xml':'.svg','application/pdf':'.pdf','video/mp4':'.mp4','video/quicktime':'.mov','video/webm':'.webm'};
  const filename=/\.(png|jpe?g|webp|svg|pdf|mp4|mov|webm)$/i.test(asset.name)?asset.name:asset.name+(ext[asset.mime]||'');
  const download=new URL(request.url).searchParams.get('download')==='1';
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.mime,
      ...(object.size ? { 'Content-Length': String(object.size) } : {}),
      'Content-Disposition': `${download || asset.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
