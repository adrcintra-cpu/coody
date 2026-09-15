import { env } from 'cloudflare:workers';
import { verifyMagnificWebhook } from '@/lib/magnific-client';
import { database } from '@/lib/repository';
import { syncMagnific, type MagnificJob } from '@/lib/magnific-jobs';
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length')) > 100000)
    return new Response(null, { status: 413 });
  const body = await request.text();
  if (body.length > 100000) return new Response(null, { status: 413 });
  const secret =
    (env as unknown as Record<string, string>).MAGNIFIC_WEBHOOK_SECRET || '';
  if (!(await verifyMagnificWebhook(secret, request.headers, body)))
    return new Response(null, { status: 401 });
  try {
    const data = JSON.parse(body) as { task_id?: string };
    if (!data.task_id) return new Response(null, { status: 400 });
    const job = await database()
      .prepare('SELECT * FROM magnific_jobs WHERE taskId=?')
      .bind(data.task_id)
      .first<MagnificJob>();
    if (job) await syncMagnific(job);
    return Response.json({ ok: true });
  } catch {
    return new Response(null, { status: 503 });
  }
}
