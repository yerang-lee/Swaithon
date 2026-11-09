const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
let session = { access_token: 'test-token', expiresAt: Date.now() + 60000 },
  response,
  failure,
  calls = [],
  handler;
class ApiError extends Error {
  constructor(status, message = 'private') {
    super(message);
    this.status = status;
  }
}
const api = {};
new Function('require', 'exports', compile('src/services/api/favorites.ts'))(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          getJson: async (url, token) => {
            calls.push({ url, token });
            if (failure) throw failure;
            return handler ? handler(url) : response;
          },
        },
  api,
);
const item = {
  favorite_id: 8,
  listing_id: 7,
  product_id: 2,
  product_name: '사과',
  store_id: 1,
  store_name: '가게',
  market_id: 5,
  market_name: '시장',
  category_id: 2,
  category: 2,
  category_name: '과일',
  price: 10000,
  sale_price: 8000,
  is_sold_out: false,
  is_on_sale: true,
  image_url: null,
  created_at: '2026-11-03T10:00:00+09:00',
};
(async () => {
  response = { favorites: [item], total_count: 1, page: 1, size: 10 };
  assert.deepEqual((await api.getFavorites()).favorites, [item]);
  assert.equal(calls[0].token, 'test-token');
  const url = new URL(calls[0].url, 'https://test.invalid');
  assert.equal(url.pathname, '/users/me/favorites');
  assert.deepEqual([...url.searchParams.keys()], ['page', 'size']);
  for (const change of [
    { favorite_id: '8' },
    { market_id: null },
    { category_id: '2' },
    { category: 'FRUIT' },
    { image_url: undefined },
    { is_on_sale: null },
    { created_at: 'invalid' },
    { sale_price: -1 },
  ]) {
    response = {
      favorites: [{ ...item, ...change }],
      total_count: 1,
      page: 1,
      size: 10,
    };
    await assert.rejects(() => api.getFavorites(), /목록 응답/);
  }
  for (const change of [
    { category_id: null, category_name: null },
    { category: undefined, category_name: undefined },
  ]) {
    response = {
      favorites: [{ ...item, ...change }],
      total_count: 1,
      page: 1,
      size: 10,
    };
    assert.equal((await api.getFavorites()).favorites.length, 1);
  }
  for (const status of [400, 401, 500]) {
    failure = new ApiError(status);
    await assert.rejects(
      () => api.getFavorites(),
      (e) => e.status === status && !e.message.includes('private'),
    );
  }
  failure = undefined;
  await assert.rejects(() => api.getFavorites(0));
  calls = [];
  handler = (url) => {
    const page = Number(
      new URL(url, 'https://test.invalid').searchParams.get('page'),
    );
    return {
      favorites: Array.from({ length: page === 1 ? 10 : 2 }, (_, i) => ({
        ...item,
        favorite_id: 1 + (page - 1) * 10 + i,
        listing_id: 1 + (page - 1) * 10 + i,
      })),
      total_count: 12,
      page,
      size: 10,
    };
  };
  assert.equal((await api.getAllFavorites()).length, 12);
  assert.equal(calls.length, 2);
  handler = () => ({ favorites: [], total_count: 30, page: 1, size: 10 });
  await assert.rejects(() => api.getAllFavorites(), /다음 페이지/);
  let active = true;
  handler = () => {
    active = false;
    return { favorites: [item], total_count: 1, page: 1, size: 10 };
  };
  assert.deepEqual(await api.getAllFavorites(() => active), []);
  handler = undefined;
  session = null;
  await assert.rejects(
    () => api.getFavorites(),
    (e) => e.status === 401,
  );
  console.log(
    'PASS: favorites GET/Bearer/page schema, nullable image, strict fields/errors, full pagination for search, no-progress guard, stale/account guards',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
