const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
const item = {
  rank: 1,
  score: 0.95,
  listing_id: 'listing_101',
  product_id: 'product_apple',
  store_id: 'store_12',
  store_name: '과일가게',
  market_id: 'market_3',
  name: '사과 1kg',
  category_id: 'category_5',
  price: 10000,
  distance_km: 0.5,
  created_at: '2026-11-01T09:00:00+09:00',
};
const original = {
  request_id: 'rec_1',
  as_of: '2026-11-03T11:00:00+09:00',
  generated_at: '2026-11-03T11:00:01+09:00',
  rule_version: 'v1.0',
  user_state: {},
  items: [item],
};
let session = { access_token: 'current-user', expiresAt: Date.now() + 60000 },
  response = structuredClone(original),
  failure,
  calls = [],
  changeAccount = false;
class ApiError extends Error {
  constructor(status, message = 'error') {
    super(message);
    this.status = status;
  }
}
const api = {};
new Function(
  'require',
  'exports',
  compile('src/services/api/recommendations.ts'),
)(
  (name) =>
    name === './recommendationEvents'
      ? { registerRecommendationRequest() {} }
      : name === './auth'
        ? { getAuthSession: () => session }
        : {
            ApiError,
            getJson: async (url, token) => {
              calls.push({ url, token });
              if (failure) throw failure;
              if (changeAccount)
                session = { ...session, access_token: 'another-user' };
              return response;
            },
          },
  api,
);
(async () => {
  assert.deepEqual(await api.getRecommendations(), original);
  let query = new URL(calls.at(-1).url, 'https://test.invalid');
  assert.equal(query.pathname, '/recommendations');
  assert.equal(query.searchParams.get('top_n'), '20');
  assert.equal(query.searchParams.has('market_id'), false);
  assert.equal(calls.at(-1).token, 'current-user');
  response.items[0].market_id = 'market & 3';
  await api.getRecommendations({ market_id: 'market & 3', top_n: 5 });
  query = new URL(calls.at(-1).url, 'https://test.invalid');
  assert.equal(query.searchParams.get('market_id'), 'market & 3');
  assert.equal(query.searchParams.get('top_n'), '5');
  response = structuredClone(original);
  response.items = [{ ...item, rank: 2, listing_id: 'second' }, item];
  assert.deepEqual(
    (await api.getRecommendations()).items.map((i) => i.listing_id),
    ['listing_101', 'second'],
  );
  assert.equal(response.items[0].rank, 2);
  response = { ...original, items: [] };
  assert.equal((await api.getRecommendations()).items.length, 0);
  for (const bad of [
    { top_n: 0 },
    { top_n: 21 },
    { top_n: 1.5 },
    { market_id: '' },
  ])
    await assert.rejects(api.getRecommendations(bad), /조건/);
  for (const patch of [
    { listing_id: 101 },
    { price: '10000' },
    { distance_km: null },
    { distance_km: -1 },
    { category_id: 5 },
    { created_at: 'bad' },
    { rank: 0 },
    { score: '0.95' },
  ]) {
    response = { ...original, items: [{ ...item, ...patch }] };
    await assert.rejects(api.getRecommendations(), /응답/);
  }
  response = { ...original, user_state: [] };
  await assert.rejects(api.getRecommendations(), /응답/);
  response = structuredClone(original);
  await assert.rejects(api.getRecommendations({ market_id: 'other' }), /응답/);
  for (const status of [401, 404, 500]) {
    failure = new ApiError(status);
    await assert.rejects(
      api.getRecommendations(),
      (e) => e instanceof ApiError && e.status === status,
    );
  }
  failure = null;
  const count = calls.length;
  session = null;
  await assert.rejects(api.getRecommendations(), (e) => e.status === 401);
  assert.equal(calls.length, count);
  session = { access_token: 'expired', expiresAt: 0 };
  await assert.rejects(api.getRecommendations(), (e) => e.status === 401);
  session = { access_token: 'current-user', expiresAt: Date.now() + 60000 };
  changeAccount = true;
  await assert.rejects(api.getRecommendations(), /계정이 변경/);
  const mock = {};
  new Function(
    'require',
    'exports',
    '__DEV__',
    'process',
    compile('src/services/devMock.ts'),
  )(() => ({}), mock, true, { env: {} });
  const token = (
    await mock.mockRequest('/auth/login', 'POST', { phone: '01000000002' })
  ).access_token;
  const preview = await mock.mockRequest(
    '/recommendations?top_n=3',
    'GET',
    undefined,
    token,
  );
  assert.equal(preview.items.length, 3);
  assert.equal(typeof preview.items[0].listing_id, 'string');
  const detail = await mock.mockRequest(
    `/products/${preview.items[0].listing_id}`,
    'GET',
  );
  assert.equal(String(detail.listing_id), preview.items[0].listing_id);
  console.log(
    'PASS: recommendation query/Bearer contract, rank order, empty/invalid payloads, errors, account guards and mock recommendations/detail IDs',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
