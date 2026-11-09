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
    name === '../devMock' ? { isMockMode: () => false } : { logApiError() {} },
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
  const mock = {};
  new Function(
    'require',
    'exports',
    '__DEV__',
    'process',
    compile('src/services/devMock.ts'),
  )(() => ({}), mock, true, { env: {} });
  async function login(phone) {
    await mock.mockRequest('/auth/signup', 'POST', { phone, name: '테스트' });
    return (await mock.mockRequest('/auth/login', 'POST', { phone }))
      .access_token;
  }
  const owner = await login('01011112222'),
    other = await login('01022223333');
  const saved = await mock.mockRequest(
    '/favorites',
    'POST',
    { listing_id: 101, request_id: 'rec_1' },
    owner,
  );
  const path = '/favorites/' + encodeURIComponent(saved.favorite_id);
  const listed = await mock.mockRequest(
    '/users/me/favorites?page=1&size=10',
    'GET',
    undefined,
    owner,
  );
  assert.equal(listed.total_count, 1);
  assert.equal(listed.favorites[0].favorite_id, saved.favorite_id);
  assert.equal(listed.favorites[0].image_url, null);
  assert.equal(
    (
      await mock.mockRequest(
        '/users/me/favorites?page=1&size=10',
        'GET',
        undefined,
        other,
      )
    ).total_count,
    0,
  );
  await assert.rejects(
    () => mock.mockRequest(path, 'DELETE', undefined, other),
    /다른 사용자/,
  );
  const removed = await mock.mockRequest(path, 'DELETE', undefined, owner);
  assert.equal(removed.favorite_id, saved.favorite_id);
  assert.equal(removed.listing_id, 101);
  assert.equal(
    (
      await mock.mockRequest(
        '/users/me/favorites?page=1&size=10',
        'GET',
        undefined,
        owner,
      )
    ).total_count,
    0,
  );
  await assert.rejects(
    () => mock.mockRequest(path, 'DELETE', undefined, owner),
    /찾을 수 없/,
  );
  const readded = await mock.mockRequest(
    '/favorites',
    'POST',
    { listing_id: 101 },
    owner,
  );
  assert.notEqual(readded.favorite_id, saved.favorite_id);
  console.log(
    'PASS: real client bodyless DELETE/Bearer/200 check, mock ownership and repeated cancellation, re-add creates new favorite ID',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
