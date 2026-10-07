import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { head } from '@vercel/blob';
import { authorize, forbid } from '@/lib/auth';
import { assertBrandWorkspace } from '@/lib/workspaces';
import { database, insert } from '@/lib/repository';
import { canonicalCategory } from '@/lib/brand-memory';

/**
 * Direct upload of large files (videos, carousels, PDFs) from the browser to
 * the storage, bypassing the 4.5 MB request limit of the server functions.
 * 1) POST with the client-upload event: returns a short-lived token only for
 *    brands/<brand of this workspace>/<new uuid>.
 * 2) POST {action:'register', ...}: after the upload, records the file in the
 *    brand Library once the storage confirms it exists.
 */
const allowedTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/pdf',
];
export const MAX_DIRECT_MB = 500;
const keyPattern = /^brands\/([A-Za-z0-9-]{1,80})\/([0-9a-f-]{36})$/;

export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  { const denied = forbid(user, 'edit'); if (denied) return denied; }
  try {
    const body = (await request.json()) as HandleUploadBody & {
      action?: string;
      key?: string;
      name?: string;
      category?: string;
      description?: string;
    };
    if (body.action === 'register') {
      const match = keyPattern.exec(body.key || '');
      if (!match) throw new Error('Arquivo inválido.');
      const [, brandId, id] = match;
      await assertBrandWorkspace(request, brandId);
      const blob = await head(body.key!).catch(() => null);
      if (!blob) throw new Error('O envio não foi concluído. Tente de novo.');
      const mime = allowedTypes.includes(blob.contentType) ? blob.contentType : '';
      if (!mime) throw new Error('Tipo de arquivo não aceito.');
      const now = new Date().toISOString();
      await insert(
        'brand_assets',
        {
          id,
          brandId,
          name: (typeof body.name === 'string' && body.name.trim() ? body.name.trim() : id).slice(0, 200),
          category: canonicalCategory(typeof body.category === 'string' ? body.category : 'delivery'),
          mime,
          url: '/api/assets/' + id,
          description: typeof body.description === 'string' ? body.description.slice(0, 2000) : '',
          aiNotes: '',
          priority: 0,
          approved: 0,
          createdAt: now,
          updatedAt: now,
        },
        true,
      ).run();
      return Response.json({ ok: true, id, url: '/api/assets/' + id, mime, size: blob.size });
    }
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const match = keyPattern.exec(pathname);
        if (!match) throw new Error('Caminho de envio inválido.');
        await assertBrandWorkspace(request, match[1]);
        if (await database().prepare('SELECT id FROM brand_assets WHERE id=?').bind(match[2]).first())
          throw new Error('Arquivo já existe.');
        return {
          allowedContentTypes: allowedTypes,
          maximumSizeInBytes: MAX_DIRECT_MB * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
      // The file is registered explicitly by the browser (action register).
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Falha no envio.' },
      { status: 400 },
    );
  }
}
