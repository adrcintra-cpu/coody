import test from 'node:test';
import assert from 'node:assert/strict';
import { openaiRequest, parseCreative } from '../lib/openai-client.ts';
test('OpenAI quota and rate limit are distinct and secrets stay out of errors', async () => {
  for (const [code, pattern] of [
    ['insufficient_quota', /Créditos/],
    ['rate_limit_exceeded', /limite de requisições/],
  ]) {
    await assert.rejects(
      () =>
        openaiRequest('secret', 'responses', {}, async () =>
          Response.json(
            { error: { code, message: 'secret' } },
            { status: 429 },
          ),
        ),
      pattern,
    );
  }
});
test('OpenAI requests use fixed origin, server auth, manual redirects and no retry', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      openaiRequest('secret', 'responses', {}, async (url, options) => {
        calls++;
        assert.equal(url, 'https://api.openai.com/v1/responses');
        assert.equal(options.headers.Authorization, 'Bearer secret');
        assert.equal(options.redirect, 'manual');
        return new Response('', { status: 302 });
      }),
    /não concluiu/,
  );
  assert.equal(calls, 1);
});
test('Creative parsing accepts structured text and rejects refusals and invalid hashtags', () => {
  const value = {
    headline: 'Headline',
    copy: 'Texto',
    caption: 'Legenda',
    hashtags: ['#Um', '#Dois', '#Três', '#Quatro', '#Cinco'],
    visualPrompt: 'Composição',
  };
  const wrap = (v) => ({
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(v) }],
      },
    ],
  });
  assert.deepEqual(parseCreative(wrap(value)), value);
  assert.throws(() =>
    parseCreative({
      output: [{ type: 'message', content: [{ type: 'refusal' }] }],
    }),
  );
  assert.throws(() =>
    parseCreative(
      wrap({
        ...value,
        hashtags: ['#Um', '#um', '#Três', '#Quatro', '#Cinco'],
      }),
    ),
  );
  assert.throws(() => parseCreative(wrap({ ...value, caption: '' })));
});

test('Unknown 429 is not presented as temporary and quota type is recognized', async () => {
  await assert.rejects(
    () =>
      openaiRequest(
        'secret',
        'responses',
        {},
        async () => new Response('gateway blocked', { status: 429 }),
      ),
    /sem confirmação/,
  );
  await assert.rejects(
    () =>
      openaiRequest('secret', 'responses', {}, async () =>
        Response.json(
          { error: { type: 'insufficient_quota' } },
          { status: 429 },
        ),
      ),
    /Créditos/,
  );
  await assert.rejects(
    () =>
      openaiRequest('secret', 'responses', {}, async () =>
        Response.json(
          { error: { code: 'rate_limit_exceeded' } },
          { status: 429, headers: { 'retry-after': '20' } },
        ),
      ),
    /20 segundos/,
  );
});

test('Image edits transmit original files as multipart without JSON content type', async () => {
  const body = new FormData();
  body.append(
    'image[]',
    new File(['reference'], 'logo.png', { type: 'image/png' }),
  );
  body.append('model', 'gpt-image-2');
  await openaiRequest('secret', 'images/edits', body, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert.equal(options.body, body);
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(await options.body.get('image[]').text(), 'reference');
    return Response.json({ data: [] });
  });
});

test('Materials stay isolated by brand and unapproved AI outputs are excluded', async () => {
  const { creativeMaterials, base64 } =
    await import('../lib/creative-materials.ts');
  const assets = [
    {
      id: 'ref',
      brandId: 'a',
      category: 'visual_reference',
      name: 'Reference',
    },
    { id: 'foreign', brandId: 'b', category: 'logo', name: 'Other logo' },
    { id: 'logo', brandId: 'a', category: 'logo', name: 'Logo principal' },
    {
      id: 'ai',
      brandId: 'a',
      category: 'visual_reference',
      aiNotes: 'Criativo gerado com OpenAI',
    },
    {
      id: 'approved',
      brandId: 'a',
      category: 'approved_art',
      aiNotes: 'Criativo gerado com OpenAI',
      approved: 1,
    },
  ];
  assert.deepEqual(
    creativeMaterials('a', assets).map((a) => a.id),
    ['logo', 'approved', 'ref'],
  );
  assert.throws(() => creativeMaterials('all', assets));
  assert.equal(
    base64(new Uint8Array([0, 255, 23])),
    Buffer.from([0, 255, 23]).toString('base64'),
  );
});
