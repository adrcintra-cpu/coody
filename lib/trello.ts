import { activeState } from './brand-lifecycle';
import { env } from 'cloudflare:workers';
import { database, bucket, readState } from './repository';
import { trello, unseal } from './trello-client';
export type Connection = {
  id: string;
  credentials: string;
  memberId: string;
  memberName: string;
  boardId: string;
  boardName: string;
  approvalList: string;
  changesList: string;
  approvedList: string;
  updatedAt: string;
};
export type Exported = {
  id: string;
  contentId: string;
  versionId: string;
  boardId: string;
  cardId: string;
  cardUrl: string;
  state: string;
  leaseUntil: number;
  updatedAt: string;
};
export type Board = { id: string; name: string; closed: boolean };
export type List = {
  id: string;
  name: string;
  idBoard: string;
  closed: boolean;
};
export function secret() {
  const key = (env as unknown as Record<string, string>).TRELLO_ENCRYPTION_KEY;
  if (!key)
    throw new Error(
      'A conexão Trello ainda precisa ser habilitada no servidor.',
    );
  return key;
}
export async function connection() {
  return database()
    .prepare("SELECT * FROM trello_connection WHERE id='owner'")
    .first<Connection>();
}
export async function client() {
  const config = await connection();
  if (!config) throw new Error('Conecte sua conta Trello.');
  const credentials = await unseal(config.credentials, secret());
  return {
    config,
    call: <T>(path: string, init?: RequestInit) =>
      trello<T>(credentials, path, init),
  };
}
export async function send(contentId: string) {
  const { config, call } = await client();
  if (!config.boardId || !config.approvalList)
    throw new Error('Escolha o quadro e as listas.');
  const state = activeState(await readState()),
    content = state.contents.find((c) => c.id === contentId);
  if (!content || content.status !== 'APROVAÇÃO')
    throw new Error('Envie apenas conteúdos que estejam aguardando aprovação.');
  const version = state.versions
    .filter((v) => v.contentId === content.id)
    .sort((a, b) => b.number - a.number)[0];
  if (!version) throw new Error('Versão não encontrada.');
  for (const [format, url] of [
    ['Feed', version.feedUrl],
    ['Story', version.storyUrl],
  ]) {
    if (!content.format.includes(format)) continue;
    const asset = [...state.assets, ...(state.storyAssets ?? [])].find(
      (a) => a.brandId === content.brandId && a.url === url,
    );
    if (!asset)
      throw new Error(
        'Anexe a arte e aguarde a adaptação do Story antes de enviar.',
      );
    const object = await bucket().head(
      'brands/' + asset.brandId + '/' + asset.id,
    );
    if (!object)
      throw new Error(
        'Uma das artes não está disponível. Reenvie pela biblioteca.',
      );
    if (object.size > 10 * 1024 * 1024)
      throw new Error('Use artes de até 10 MB para enviar ao Trello.');
  }
  const id = config.boardId + ':' + version.id,
    db = database(),
    now = new Date().toISOString();
  let saved = await db
    .prepare('SELECT * FROM trello_exports WHERE id=?')
    .bind(id)
    .first<Exported>();
  if (saved?.state === 'sent')
    return { cardUrl: saved.cardUrl, message: 'Esta versão já foi enviada.' };
  if (saved && saved.leaseUntil > Date.now())
    throw new Error(
      'O envio está em andamento. Aguarde cinco minutos antes de conferir novamente.',
    );
  const wasExisting = !!saved;
  const lease = Date.now() + 300000;
  const claim = saved
    ? await db
        .prepare(
          'UPDATE trello_exports SET leaseUntil=? WHERE id=? AND leaseUntil<=?',
        )
        .bind(lease, id, Date.now())
        .run()
    : await db
        .prepare(
          'INSERT OR IGNORE INTO trello_exports (id,contentId,versionId,boardId,cardId,cardUrl,state,leaseUntil,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          content.id,
          version.id,
          config.boardId,
          '',
          '',
          'pending',
          lease,
          now,
        )
        .run();
  if (!claim.meta.changes)
    throw new Error('Outro envio desta versão está em andamento.');
  const marker = 'COODY-VERSION:' + version.id;
  try {
    // Recover ambiguous card creation by its unique marker; never blindly create again.
    if (wasExisting && !saved?.cardId) {
      const cards = await call<
        Array<{ id: string; url: string; desc: string }>
      >('/boards/' + config.boardId + '/cards/all?fields=id,url,desc');
      const found = cards.filter((c) => c.desc.includes(marker));
      if (found.length !== 1)
        throw new Error(
          'O envio anterior não pôde ser confirmado. Confira o quadro antes de qualquer novo envio; nenhum card duplicado foi criado.',
        );
      saved = { ...saved!, cardId: found[0].id, cardUrl: found[0].url };
    }
    const brand = state.brands.find((b) => b.id === content.brandId)!;
    const description = [
      brand.name + ' · ' + content.format + ' · V' + version.number,
      'Headline: ' + version.headline,
      'Texto de apoio: ' + version.copy,
      'Legenda:\n' + version.caption,
      version.hashtags.join(' '),
      'Briefing:\n' + content.brief,
      'Publicação planejada: ' + content.date,
      marker,
    ].join('\n\n');
    let cardId = saved?.cardId,
      cardUrl = saved?.cardUrl;
    if (!cardId) {
      const card = await call<{ id: string; url: string }>('/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idList: config.approvalList,
          name: brand.name + ' · ' + content.title + ' · V' + version.number,
          desc:
            'Envio de arquivos em andamento. Aguarde a conclusão antes de aprovar.\n\n' +
            description,
          due: content.date + 'T12:00:00Z',
          pos: 'bottom',
        }),
      });
      cardId = card.id;
      cardUrl = card.url;
    }
    await db
      .prepare('UPDATE trello_exports SET cardId=?,cardUrl=? WHERE id=?')
      .bind(cardId, cardUrl, id)
      .run();
    const attachments = await call<Array<{ name: string }>>(
      '/cards/' + cardId + '/attachments?fields=name',
    );
    for (const [format, url] of [
      ['Feed', version.feedUrl],
      ['Story', version.storyUrl],
    ]) {
      if (!url) continue;
      const asset = [...state.assets, ...(state.storyAssets ?? [])].find(
        (a) => a.brandId === content.brandId && a.url === url,
      );
      if (!asset)
        throw new Error('Arte não encontrada na biblioteca desta marca.');
      const name =
        format +
        '-' +
        version.id +
        '-' +
        asset.id +
        '.' +
        (asset.mime === 'image/jpeg'
          ? 'jpg'
          : asset.mime === 'image/webp'
            ? 'webp'
            : 'png');
      if (attachments.some((a) => a.name === name)) continue;
      const object = await bucket().get(
        'brands/' + asset.brandId + '/' + asset.id,
      );
      if (!object)
        throw new Error(
          'Arquivo indisponível. O envio pode ser retomado sem duplicar o card.',
        );
      const data = new FormData();
      data.set('name', name);
      data.set(
        'file',
        new Blob([await object.arrayBuffer()], { type: asset.mime }),
        name,
      );
      await call('/cards/' + cardId + '/attachments', {
        method: 'POST',
        body: data,
      });
    }
    await call('/cards/' + cardId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desc: description }),
    });
    await db
      .prepare(
        "UPDATE trello_exports SET state='sent',leaseUntil=0,updatedAt=? WHERE id=?",
      )
      .bind(new Date().toISOString(), id)
      .run();
    return { cardUrl, message: 'Conteúdo e artes enviados ao Trello.' };
  } finally {
    await db
      .prepare(
        'UPDATE trello_exports SET leaseUntil=0 WHERE id=? AND leaseUntil=?',
      )
      .bind(id, lease)
      .run();
  }
}
