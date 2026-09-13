import { authorize } from '@/lib/auth';
import { database } from '@/lib/repository';
import { client, connection, secret, send } from '@/lib/trello';
import type { Board, List } from '@/lib/trello';
import { seal, trello, validCredentials } from '@/lib/trello-client';
export async function GET(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  try {
    const config = await connection();
    if (!config)
      return Response.json(
        { connected: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    const { credentials: _credentials, ...safe } = config;
    const { call } = await client();
    const boards = await call<Board[]>(
      '/members/me/boards?filter=open&fields=id,name,closed',
    );
    const board =
      new URL(request.url).searchParams.get('board') || config.boardId;
    const lists =
      board && boards.some((b) => b.id === board)
        ? await call<List[]>(
            '/boards/' +
              board +
              '/lists?filter=open&fields=id,name,idBoard,closed',
          )
        : [];
    const exports = await database()
      .prepare(
        'SELECT id,contentId,versionId,cardUrl,state,updatedAt FROM trello_exports ORDER BY updatedAt DESC LIMIT 100',
      )
      .all();
    return Response.json(
      {
        connected: true,
        config: safe,
        boards,
        lists,
        exports: exports.results,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Falha ao consultar Trello.',
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    if (Number(request.headers.get('content-length') || 0) > 8192)
      throw new Error('Solicitação muito grande.');
    const data = (await request.json()) as Record<string, string>;
    if (data.action === 'connect') {
      if (!validCredentials(data))
        throw new Error('Confira a chave e o token do Trello.');
      const member = await trello<{ id: string; fullName: string }>(
        data,
        '/members/me?fields=id,fullName',
      );
      const current = await connection();
      if (current && current.memberId !== member.id)
        throw new Error(
          'Desconecte a conta atual antes de conectar outra conta.',
        );
      const encrypted = await seal(
        { key: data.key, token: data.token },
        secret(),
      );
      await database()
        .prepare(
          "INSERT INTO trello_connection (id,credentials,memberId,memberName,updatedAt) VALUES ('owner',?,?,?,?) ON CONFLICT(id) DO UPDATE SET credentials=excluded.credentials,memberName=excluded.memberName,updatedAt=excluded.updatedAt",
        )
        .bind(encrypted, member.id, member.fullName, new Date().toISOString())
        .run();
      return Response.json({
        ok: true,
        message: 'Conta conectada. Escolha o quadro e as listas.',
      });
    }
    if (data.action === 'disconnect') {
      await database()
        .prepare("DELETE FROM trello_connection WHERE id='owner'")
        .run();
      return Response.json({
        ok: true,
        message:
          'Conta desconectada do COODY. Os cards foram preservados. Você pode revogar o token nas configurações do Trello.',
      });
    }
    if (data.action === 'configure') {
      const { call } = await client();
      const boards = await call<Board[]>(
        '/members/me/boards?filter=open&fields=id,name,closed',
      );
      const board = boards.find((b) => b.id === data.boardId);
      if (!board)
        throw new Error('Selecione um quadro acessível à conta conectada.');
      const lists = await call<List[]>(
        '/boards/' +
          board.id +
          '/lists?filter=open&fields=id,name,idBoard,closed',
      );
      const selected = [data.approvalList, data.changesList, data.approvedList];
      if (
        new Set(selected).size !== 3 ||
        selected.some(
          (id) => !lists.some((l) => l.id === id && l.idBoard === board.id),
        )
      )
        throw new Error('Escolha três listas diferentes do mesmo quadro.');
      await database()
        .prepare(
          "UPDATE trello_connection SET boardId=?,boardName=?,approvalList=?,changesList=?,approvedList=?,updatedAt=? WHERE id='owner'",
        )
        .bind(board.id, board.name, ...selected, new Date().toISOString())
        .run();
      return Response.json({ ok: true, message: 'Quadro e listas salvos.' });
    }
    if (data.action === 'send')
      return Response.json(await send(data.contentId));
    throw new Error('Ação não disponível.');
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível concluir a integração.',
      },
      { status: 400 },
    );
  }
}
