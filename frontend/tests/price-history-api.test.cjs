const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const api = {};
let session = { access_token: 'token', expiresAt: Date.now() + 60000 };
let calls = [];
let response = {
  listing_id: 101,
  product_id: 1,
  product_name: '사과',
  store_id: 2,
  store_name: '가게',
  current_price: 4500,
  price_history: [
    { price: 5000, recorded_at: '2026-11-01T10:00:00+09:00' },
    { price: 4500, recorded_at: '2026-11-03T09:00:00+09:00' },
  ],
};
let failure;
class ApiError extends Error {
  constructor(status) {
    super('HTTP');
    this.status = status;
  }
}
new Function(
  'require',
  'exports',
  ts.transpileModule(
    fs.readFileSync(
      require('node:path').join(
        __dirname,
        '../src/services/api/priceHistory.ts',
      ),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
)(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          getJson: async (...args) => {
            calls.push(args);
            if (failure) throw failure;
            return response;
          },
        },
  api,
);
(async () => {
  assert.equal((await api.getPriceHistory('101')).current_price, 4500);
  assert.deepEqual(calls[0], ['/products/101/price-history', 'token']);
  const original = response;
  response = { ...original, price_history: [] };
  assert.deepEqual((await api.getPriceHistory('101')).price_history, []);
  for (const invalid of [
    { ...original, listing_id: 102 },
    { ...original, current_price: null },
    { ...original, price_history: [...original.price_history].reverse() },
    { ...original, price_history: [{ price: -1, recorded_at: 'invalid' }] },
    { ...original, price_history: [{ price: 0, recorded_at: null }] },
  ]) {
    response = invalid;
    await assert.rejects(() => api.getPriceHistory('101'), /명세/);
  }
  response = {
    ...original,
    current_price: 0,
    price_history: [{ price: 0, recorded_at: '2026-11-01T00:00:00Z' }],
  };
  assert.equal((await api.getPriceHistory('101')).current_price, 0);
  const before = calls.length;
  for (const id of ['listing_101', '0', '-1', '1.2', '9007199254740992'])
    await assert.rejects(() => api.getPriceHistory(id));
  assert.equal(calls.length, before);
  for (const status of [401, 404, 500]) {
    failure = new ApiError(status);
    await assert.rejects(
      () => api.getPriceHistory('101'),
      status === 401 ? /로그인/ : status === 404 ? /찾을/ : /불러오지/,
    );
  }
  failure = null;
  session = null;
  await assert.rejects(() => api.getPriceHistory('101'), /로그인/);
  console.log(
    'PASS: authenticated integer listing price history, exact scope, ordered timestamps, zero prices, empty history, malformed responses, no fabricated IDs and HTTP errors',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
