import { authorize } from '@/lib/auth';
import { readState } from '@/lib/repository';
export async function GET(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  return Response.json(
    {
      format: 'coody-export-v1',
      exportedAt: new Date().toISOString(),
      workspace: await readState(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="coody-dados.json"',
      },
    },
  );
}
