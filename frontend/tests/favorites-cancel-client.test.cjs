const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
const client = {};
let call,
  status = 200;
new Function(
  'require',
  'exports',
  'fetch',
  'process',
  compile('src/services/api/client.ts'),
)(
  (name) =>
    ({ logApiError() {} }),
  client,
  async (url, options) => {
    call = { url, ...options };
    return {
      ok: true,
      status,
      text: async () =>
        '{"favorite_id":"favorite_1","listing_id":"listing_101","message":"취소"}',
    };
  },
  { env: { EXPO_PUBLIC_API_URL: 'https://test.invalid' } },
);
(async () => {
  await client.deleteJson('/favorites/favorite_1', 'test-token', 200);
  assert.equal(call.method, 'DELETE');
  assert.equal(call.body, undefined);
  assert.equal(call.headers.Authorization, 'Bearer test-token');
  assert.equal(new URL(call.url).search, '');
  status = 204;
  await assert.rejects(
    () => client.deleteJson('/favorites/favorite_1', 'test-token', 200),
    /응답 상태/,
  );
  console.log('PASS: favorites-cancel-client server API regression checks');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
