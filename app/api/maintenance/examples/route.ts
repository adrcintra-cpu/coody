import { authorize } from '@/lib/auth';
import { database } from '@/lib/repository';
import expected from '@/lib/maintenance/legacy-snapshot.json';
// Operational reference only: never seed these records into a workspace.
const emptyTables = [
  'activity_logs',
  'approvals',
  'brand_guidelines',
  'content_pillars',
  'generated_assets',
  'products',
  'services',
  'trello_cards',
  'trello_integrations',
];
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const db = database();
  const backupId = 'original-examples-v1';
  if (
    await db
      .prepare('SELECT id FROM maintenance_backups WHERE id=?')
      .bind(backupId)
      .first()
  )
    return Response.json({ ok: true });
  const tables = [...Object.keys(expected), ...emptyTables];
  const results = await db.batch(
    tables.map((t) => db.prepare(`SELECT * FROM ${t}`)),
  );
  const snapshot: Record<string, Record<string, unknown>[]> = {};
  const reference = expected as Record<string, Record<string, unknown>[]>;
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i],
      rows = results[i].results as Record<string, unknown>[];
    const original = reference[table] || [];
    if (
      rows.length !== original.length ||
      rows.some(
        (row) =>
          !original.some((old) =>
            Object.keys(row).every((k) => row[k] === old[k]),
          ),
      )
    )
      return Response.json(
        {
          error:
            'Há dados novos ou exemplos alterados. Nada foi removido; é necessário revisar esses registros para preservar seu trabalho.',
        },
        { status: 409 },
      );
    snapshot[table] = rows;
  }
  const statements = [
    db
      .prepare(
        'INSERT INTO maintenance_backups (id,payload,createdAt) VALUES (?,?,?)',
      )
      .bind(backupId, JSON.stringify(snapshot), new Date().toISOString()),
  ];
  // Abort the entire transaction if ANY row changes between inspection and cleanup.
  for (const [table, rows] of Object.entries(snapshot)) {
    statements.push(
      db
        .prepare(
          `UPDATE maintenance_backups SET payload=CASE WHEN (SELECT COUNT(*) FROM ${table})=? THEN payload ELSE NULL END WHERE id=?`,
        )
        .bind(rows.length, backupId),
    );
    for (const row of rows) {
      const keys = Object.keys(row);
      statements.push(
        db
          .prepare(
            `UPDATE maintenance_backups SET payload=CASE WHEN EXISTS (SELECT 1 FROM ${table} WHERE ${keys.map((k) => '"' + k + '" IS ?').join(' AND ')}) THEN payload ELSE NULL END WHERE id=?`,
          )
          .bind(...keys.map((k) => row[k] as string | number | null), backupId),
      );
    }
  }
  for (const table of [
    'comments',
    'content_versions',
    'content_items',
    'special_dates',
    'brands',
  ])
    statements.push(db.prepare(`DELETE FROM ${table}`));
  statements.push(
    db.prepare(
      "DELETE FROM users WHERE id='demo-admin' AND NOT EXISTS (SELECT 1 FROM activity_logs WHERE userId='demo-admin') AND NOT EXISTS (SELECT 1 FROM approvals WHERE userId='demo-admin')",
    ),
  );
  try {
    await db.batch(statements);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      {
        error:
          'Os dados mudaram durante a remoção. Nenhum registro foi removido. Atualize e tente novamente.',
      },
      { status: 409 },
    );
  }
}
