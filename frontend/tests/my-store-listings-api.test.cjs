const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
const api = {};
const imageUrls = {};
new Function('exports', compile('src/utils/imageUrl.ts'))(imageUrls);
let session = {
  access_token: 'merchant',
  role: 'MERCHANT',
  expiresAt: Date.now() + 600000,
};
const item = {
  listing_id: 1,
  product_id: 1,
  product_name: '사과',
  image_url: null,
  category_id: 2,
  price: 5000,
  sale_price: 4000,
  sale_quantity: 1.5,
  sale_unit: '봉지',
  stock_quantity: 10,
  is_sold_out: false,
  sale_rate: 20,
  created_at: '2026-11-10T10:00:00+09:00',
};
let response = { listings: [item], total_count: 1, page: 1, size: 10 };
let failure,
  stale = false;
const calls = [];
class ApiError extends Error {
  constructor(status, message = 'server') {
    super(message);
    this.status = status;
  }
}
new Function(
  'require',
  'exports',
  compile('src/services/api/myStoreListings.ts'),
)(
  (name) =>
    name === '../../utils/imageUrl' ? imageUrls : name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          getJson: async (...args) => {
            calls.push(args);
            if (failure) throw failure;
            if (stale) session = { ...session, access_token: 'other' };
            return response;
          },
        },
  api,
);
(async () => {
  assert.deepEqual(await api.getMyStoreListings(), response);
  process.env.EXPO_PUBLIC_API_URL = 'https://api.test/api';
  response = { ...response, listings: [{ ...item, image_url: '/uploads/images/apple.jpg' }] };
  assert.equal((await api.getMyStoreListings()).listings[0].image_url,
    'https://api.test/uploads/images/apple.jpg');
  response = { ...response, listings: [item] };
  assert.deepEqual(calls[0], [
    '/stores/me/listings?page=1&size=10',
    'merchant',
  ]);
  assert.equal(
    calls.some(([url]) => url.includes('/users/me')),
    false,
  );
  response = {
    ...response,
    listings: [
      {
        ...item,
        category_id: null,
        sale_price: null,
        sale_quantity: null,
        sale_unit: null,
        stock_quantity: null,
        sale_rate: null,
      },
    ],
    page: 2,
    size: 100,
  };
  await api.getMyStoreListings({ page: 2, size: 100, is_sold_out: false });
  assert.ok(calls.at(-1)[0].includes('is_sold_out=false'));
  for (const change of [
    { listing_id: '1' },
    { price: -1 },
    { sale_quantity: '1' },
    { sale_unit: undefined },
    { stock_quantity: 1.5 },
    { is_sold_out: null },
  ]) {
    response = {
      listings: [{ ...item, ...change }],
      total_count: 1,
      page: 1,
      size: 10,
    };
    await assert.rejects(api.getMyStoreListings(), /응답/);
  }
  response = { listings: [item, item], total_count: 2, page: 1, size: 10 };
  await assert.rejects(api.getMyStoreListings(), /응답/);
  for (const options of [{ page: 0 }, { size: 101 }, { is_sold_out: 'false' }])
    await assert.rejects(api.getMyStoreListings(options), /조건/);
  for (const status of [401, 403, 422, 500]) {
    failure = new ApiError(status);
    await assert.rejects(
      api.getMyStoreListings(),
      (error) => error.status === status,
    );
  }
  failure = undefined;
  response = { listings: [item], total_count: 1, page: 1, size: 10 };
  stale = true;
  await assert.rejects(api.getMyStoreListings(), /계정/);
  stale = false;
  session = { ...session, role: 'CUSTOMER' };
  await assert.rejects(
    api.getMyStoreListings(),
    (error) => error.status === 403,
  );
  session = null;
  await assert.rejects(
    api.getMyStoreListings(),
    (error) => error.status === 401,
  );
  console.log('PASS: my-store-listings-api server API regression checks');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
