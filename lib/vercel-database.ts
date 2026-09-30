import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client';
function result(value: ResultSet) {
  return { success: true, results: value.rows.map(row => Object.fromEntries(Object.entries(row))), meta: { changes: value.rowsAffected, last_row_id: Number(value.lastInsertRowid ?? 0) } };
}
class Statement {
  readonly client: Client; readonly sql: string; readonly args: InValue[];
  constructor(client: Client, sql: string, args: InValue[] = []) { this.client = client; this.sql = sql; this.args = args; }
  bind(...args: InValue[]) { return new Statement(this.client, this.sql, args); }
  async all<T>() { return result(await this.client.execute({ sql: this.sql, args: this.args })) as unknown as D1Result<T>; }
  async run() { return this.all(); }
  async first<T>(column?: string): Promise<T | null> {
    const value = (await this.all<Record<string, unknown>>()).results[0];
    return (value ? (column ? value[column] : value) : null) as T | null;
  }
}
export function createDatabase(client: Client) {
  return {
    prepare(sql: string) { return new Statement(client, sql); },
    async batch(statements: Statement[]) {
      // libSQL batches execute in one transaction; failed statements roll back all writes.
      return (await client.batch(statements.map(s => ({ sql: s.sql, args: s.args })), 'write')).map(result);
    },
  };
}
let db: ReturnType<typeof createDatabase> | undefined;
export function vercelDatabase() {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error('Banco de dados ainda não configurado.');
    db = createDatabase(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }));
  }
  return db;
}
