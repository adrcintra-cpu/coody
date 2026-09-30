import { createClient } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
if (!process.env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL não configurado.');
const db = createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
await db.execute('CREATE TABLE IF NOT EXISTS coody_migrations (name TEXT PRIMARY KEY NOT NULL)');
for (const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
  if ((await db.execute({sql:'SELECT name FROM coody_migrations WHERE name=?',args:[name]})).rows.length) continue;
  const sql = await readFile('drizzle/'+name,'utf8');
  await db.batch([...sql.split('--> statement-breakpoint').filter(s=>s.trim()).map(sql=>({sql,args:[]})),{sql:'INSERT INTO coody_migrations(name) VALUES (?)',args:[name]}], 'write');
  console.log('Aplicada:',name);
}
await db.execute('CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, expires INTEGER NOT NULL)');
db.close();
