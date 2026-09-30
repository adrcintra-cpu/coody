import { get, put, head, del, BlobNotFoundError } from '@vercel/blob';
import { vercelDatabase } from './vercel-database';
const files = {
  async put(key: string, bytes: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    return put(key, Buffer.from(new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))), { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: options?.httpMetadata?.contentType });
  },
  async get(key: string) {
    const object = await get(key, { access: 'private', useCache: false });
    if (!object || object.statusCode !== 200) return null;
    return { body: object.stream, size: object.blob.size, httpMetadata: { contentType: object.blob.contentType }, arrayBuffer: () => new Response(object.stream).arrayBuffer() };
  },
  async head(key: string) {
    try { return await head(key); } catch (error) { if (error instanceof BlobNotFoundError) return null; throw error; }
  },
  async delete(key: string) { await del(key); },
};
export const env = new Proxy({} as Record<string, unknown>, {
  get(_target, key: string) {
    if (key === 'DB') return vercelDatabase();
    if (key === 'FILES') return files;
    if (key === 'COODY_RUNTIME') return 'vercel';
    return process.env[key];
  },
});
