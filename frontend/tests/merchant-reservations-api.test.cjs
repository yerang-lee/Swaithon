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
let session = {
  access_token: 'merchant',
  role: 'MERCHANT',
  expiresAt: Date.now() + 60000,
};
let calls = [],
  failure,
  changeAccount = false;
const item = {
  reservation_id: 501,
  customer_id: 12,
  product_id: 3,
  product_name: '바나나',
  quantity: 2,
  unit_price: 2500,
  total_price: 5000,
  pickup_at: '2026-11-10T15:00:00+09:00',
  request_note: null,
  status: 'PENDING',
  created_at: '2026-11-10T10:00:00+09:00',
};
let response = { reservations: [item], total_count: 1, page: 1, size: 10 };
class ApiError extends Error {
  constructor(status, message = 'private response') {
    super(message);
    this.status = status;
  }
}
new Function(
  'require',
  'exports',
  compile('src/services/api/merchantReservations.ts'),
)(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          getJson: async (...args) => {
            calls.push(args);
            if (failure) throw failure;
            if (changeAccount) session = { ...session, access_token: 'other' };
            return response;
          },
        },
  api,
);
(async () => {
  assert.deepEqual(await api.getMerchantReservations(), response);
  const url = new URL(calls[0][0], 'https://test.invalid');
  assert.equal(url.pathname, '/reservations/merchant');
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('size'), '10');
  assert.equal(url.searchParams.has('status'), false);
  assert.equal(calls[0][1], 'merchant');
  response = {
    reservations: [{ ...item, request_note: '덜 익은 상품' }],
    total_count: 1,
    page: 2,
    size: 5,
  };
  await api.getMerchantReservations({ page: 2, size: 5, status: 'PENDING' });
  assert.equal(
    new URL(calls.at(-1)[0], 'https://test.invalid').searchParams.get('status'),
    'PENDING',
  );
  for (const invalid of [
    { reservation_id: '501' },
    { request_note: undefined },
    { quantity: 0 },
    { total_price: -1 },
    { pickup_at: 'invalid' },
    { status: 'UNKNOWN' },
  ]) {
    response = {
      reservations: [{ ...item, ...invalid }],
      total_count: 1,
      page: 1,
      size: 10,
    };
    await assert.rejects(() => api.getMerchantReservations(), /응답/);
  }
  response = { reservations: [item], total_count: 1, page: 1, size: 10 };
  await assert.rejects(
    () => api.getMerchantReservations({ status: 'READY' }),
    /응답/,
  );
  for (const code of [401, 403, 422, 500]) {
    failure = new ApiError(code);
    await assert.rejects(
      () => api.getMerchantReservations(),
      (error) => error.status === code && !error.message.includes('private'),
    );
  }
  failure = null;
  const count = calls.length;
  for (const options of [
    { page: 0 },
    { size: -1 },
    { page: 1.5 },
    { status: 'ALL' },
  ])
    await assert.rejects(() => api.getMerchantReservations(options));
  session.role = 'CUSTOMER';
  await assert.rejects(
    () => api.getMerchantReservations(),
    (error) => error.status === 403,
  );
  session = null;
  await assert.rejects(
    () => api.getMerchantReservations(),
    (error) => error.status === 401,
  );
  assert.equal(calls.length, count);
  session = {
    access_token: 'merchant',
    role: 'MERCHANT',
    expiresAt: Date.now() + 60000,
  };
  changeAccount = true;
  await assert.rejects(() => api.getMerchantReservations(), /계정/);

  console.log('PASS: merchant-reservations-api server API regression checks');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
