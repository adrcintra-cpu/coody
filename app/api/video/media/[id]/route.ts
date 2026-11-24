import { head } from '@vercel/blob';
import { authorize } from '@/lib/auth';
import { bucket, database } from '@/lib/repository';
import { allowedWorkspaceIds } from '@/lib/workspaces';

/**
 * Vídeo da biblioteca para o player do Video & Motion, com suporte a Range (o Safari só toca
 * vídeo com respostas parciais). Mesmas regras de acesso de /api/assets/[id].
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await authorize(request);
  if (user instanceof Response) return user;
  const asset = await database()
    .prepare('SELECT a.brandId, a.mime, a.name, b.workspaceId FROM brand_assets a JOIN brands b ON b.id=a.brandId WHERE a.id=?')
    .bind(id)
    .first<{ brandId: string; mime: string; name: string; workspaceId: string }>();
  if (!asset || !/^(video\/|image\/gif|audio\/)/.test(asset.mime)) return new Response('Arquivo não encontrado', { status: 404 });
  const allowed = await allowedWorkspaceIds(request).catch(() => [] as string[]);
  if (allowed && !allowed.includes(asset.workspaceId)) return new Response('Arquivo não encontrado', { status: 404 });
  const key = `brands/${asset.brandId}/${id}`;
  const download = new URL(request.url).searchParams.get('download') === '1';
  const base = {
    'Content-Type': asset.mime,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  };
  const range = request.headers.get('range');
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (range && token && /^bytes=\d*-\d*$/.test(range)) {
    const meta = await head(key).catch(() => null);
    if (meta) {
      const upstream = await fetch(meta.url, { headers: { authorization: `Bearer ${token}`, range } }).catch(() => null);
      if (upstream && (upstream.status === 206 || upstream.status === 200)) {
        const headers: Record<string, string> = { ...base };
        for (const h of ['content-range', 'content-length']) {
          const v = upstream.headers.get(h);
          if (v) headers[h] = v;
        }
        return new Response(upstream.body, { status: upstream.status, headers });
      }
    }
  }
  const object = await bucket().get(key);
  if (!object) return new Response('Arquivo não encontrado', { status: 404 });
  return new Response(object.body, { headers: { ...base, ...(object.size ? { 'Content-Length': String(object.size) } : {}) } });
}
