import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, scryptSync } from 'node:crypto';
import { createClient } from '@libsql/client';
import { createDatabase } from '../lib/vercel-database.ts';
import { signSession, readSession, checkPassword } from '../lib/session.ts';
void test('Vercel session rejects spoofed Sites headers, tampering, expiry and wrong owner',()=>{
 const secret=randomBytes(48).toString('hex'),owner='owner@example.com',now=100000;
 const req=(token)=>new Request('https://coody.test',{headers:{cookie:'coody_session='+token,'oai-authenticated-user-id':'owner','oai-authenticated-user-email':owner}});
 const token=signSession(owner,secret,now);
 assert.equal(readSession(req(token),owner,secret,now).id,'owner');
 for(const [value,email,time] of [[token+'x',owner,now],['',owner,now],[token,'another@example.com',now],[token,owner,now+43200001]]) assert.equal(readSession(req(value),email,secret,time).status,401);
 const salt=randomBytes(16).toString('hex'); const hash=salt+':'+scryptSync('correct password',salt,64).toString('hex');
 assert.ok(checkPassword('correct password',hash)); assert.equal(checkPassword('wrong',hash),false);
});
void test('libSQL preserves D1 results, atomic rollback and changes',async()=>{
 const client=createClient({url:':memory:'}); const db=createDatabase(client);
 await db.prepare('CREATE TABLE test (id TEXT PRIMARY KEY, revision INTEGER NOT NULL)').run();
 const inserted=await db.prepare('INSERT INTO test VALUES (?,?)').bind('one',1).run(); assert.equal(inserted.meta.changes,1);
 assert.equal(await db.prepare('SELECT revision FROM test WHERE id=?').bind('one').first('revision'),1);
 await assert.rejects(db.batch([db.prepare('UPDATE test SET revision=2'),db.prepare('UPDATE test SET revision=NULL')]));
 assert.equal(await db.prepare('SELECT revision FROM test').first('revision'),1);
 assert.equal((await db.prepare('UPDATE test SET revision=3 WHERE revision=2').run()).meta.changes,0);
 assert.equal((await db.prepare('SELECT * FROM test').all()).results.length,1); client.close();
});
