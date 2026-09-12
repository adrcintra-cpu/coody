import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFileStructure } from '../lib/upload-structure.ts';
const buffer = (bytes) => Uint8Array.from(bytes).buffer;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2cAAAAASUVORK5CYII=',
  'base64',
);
test('PNG exige estrutura completa, não somente prefixo', () => {
  assert.throws(() =>
    validateFileStructure(buffer([137, 80, 78, 71]), 'image/png'),
  );
  assert.throws(() =>
    validateFileStructure(buffer(png.subarray(0, -12)), 'image/png'),
  );
  validateFileStructure(buffer(png), 'image/png');
});
test('JPEG, WEBP e PDF truncados são rejeitados', () => {
  assert.throws(() =>
    validateFileStructure(buffer([255, 216, 255]), 'image/jpeg'),
  );
  assert.throws(() =>
    validateFileStructure(buffer(Buffer.from('RIFF0000WEBP')), 'image/webp'),
  );
  assert.throws(() =>
    validateFileStructure(buffer(Buffer.from('%PDF-1.7')), 'application/pdf'),
  );
});
