import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { database } from '@/lib/repository';
import { ensureVideoTables, workerAuthorized, type JobRow } from '@/lib/video';

/**
 * Envio direto dos vídeos prontos do worker do OxyVideo para o armazenamento (sem o limite de
 * 4,5 MB das funções). O token do armazenamento só sai para o worker autorizado, para a pasta da
 * marca da produção que ele está produzindo, e vale por pouco tempo.
 * clientPayload = JSON { token, workerId, jobId }.
 */
const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'image/gif', 'text/plain'];
const keyPattern = /^brands\/([A-Za-z0-9-]{1,80})\/([0-9a-f-]{36})$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let p: { token?: string; workerId?: string; jobId?: string } = {};
        try {
          p = JSON.parse(clientPayload || '{}');
        } catch {
          /* inválido */
        }
        if (!workerAuthorized(p.token)) throw new Error('Worker não autorizado.');
        const m = keyPattern.exec(pathname);
        if (!m) throw new Error('Caminho de envio inválido.');
        await ensureVideoTables();
        const job = await database().prepare('SELECT * FROM video_jobs WHERE id=?').bind(p.jobId ?? '').first<JobRow>();
        if (!job || job.status !== 'running' || job.lockedBy !== p.workerId || job.brandId !== m[1])
          throw new Error('Produção não está com este worker.');
        if (await database().prepare('SELECT id FROM brand_assets WHERE id=?').bind(m[2]).first()) throw new Error('Arquivo já existe.');
        return {
          allowedContentTypes: allowedTypes,
          maximumSizeInBytes: 2 * 1024 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
      // O worker registra o arquivo explicitamente (action 'complete').
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Falha no envio.' }, { status: 400 });
  }
}
