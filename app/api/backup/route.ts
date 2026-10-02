import { authorize, forbid } from '@/lib/auth';
import { readState } from '@/lib/repository';
export async function GET(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  { const denied = forbid(user, 'manage'); if (denied) return denied; }
  return Response.json(
    {
      format: 'coody-export-v1',
      exportedAt: new Date().toISOString(),
      workspace: await readState(request),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="coody-dados.json"',
      },
    },
  );
}
