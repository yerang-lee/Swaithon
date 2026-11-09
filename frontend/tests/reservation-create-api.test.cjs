const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/services/api/reservations.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const pickup = new Date('2099-11-03T15:00:00+09:00');
let calls = [],
  failure,
  session = { access_token: 'token', expiresAt: Date.now() + 60000 };
let response = {
  reservation_id: 501,
  user_id: 5,
  listing_id: 101,
  product_id: 1,
  product_name: '사과',
  store_id: 10,
  store_name: '과일가게',
  quantity: 2,
  unit_price: 8000,
  total_price: 16000,
  pickup_at: '2099-11-03T15:00:00+09:00',
  request_note: null,
  status: 'PENDING',
  created_at: '2026-11-03T10:00:00+09:00',
  message: '픽업 예약이 완료되었습니다.',
};
class ApiError extends Error {
  constructor(status) {
    super('error');
    this.status = status;
  }
}
const api = {};
new Function('require', 'exports', source)(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          postJson: async (...args) => {
            calls.push(args);
            if (failure) throw failure;
            return response;
          },
        },
  api,
);
(async () => {
  assert.equal(api.pickupAtKst(pickup), '2099-11-03T15:00:00+09:00');
  assert.equal(
    (await api.reserveProduct(101, 1, 2, pickup, '')).reservation_id,
    501,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/reservations');
  assert.equal(calls[0][2], 'token');
  assert.equal(calls[0][3], 201);
  assert.deepEqual(calls[0][1], {
    listing_id: 101,
    product_id: 1,
    quantity: 2,
    pickup_at: '2099-11-03T15:00:00+09:00',
  });
  response = { ...response, request_note: '잘 익은 사과' };
  await api.reserveProduct(101, 1, 2, pickup, ' 잘 익은 사과 ', 'request_101');
  assert.equal(calls.at(-1)[1].request_id, 'request_101');
  assert.equal(calls.at(-1)[1].request_note, '잘 익은 사과');
  assert.equal(calls.at(-1)[1].user_id, undefined);
  assert.equal(calls.at(-1)[1].store_id, undefined);
  assert.equal(calls.at(-1)[1].status, undefined);
  response = { ...response, status: 'READY' };
  await assert.rejects(() => api.reserveProduct(101, 1, 2, pickup, ''), /응답/);
  response = { ...response, status: 'PENDING' };
  response = { ...response, listing_id: 'other' };
  await assert.rejects(() => api.reserveProduct(101, 1, 2, pickup, ''), /응답/);
  await assert.rejects(() => api.reserveProduct('', 1, 2, pickup, ''));
  await assert.rejects(() => api.reserveProduct(101, 1, 0, pickup, ''));
  response = { ...response, listing_id: 101 };
  for (const field of [
    'reservation_id',
    'user_id',
    'listing_id',
    'product_id',
    'store_id',
  ]) {
    const saved = response;
    response = { ...saved, [field]: String(saved[field]) };
    await assert.rejects(
      () => api.reserveProduct(101, 1, 2, pickup, ''),
      /응답/,
    );
    response = saved;
  }
  const count = calls.length;
  for (const id of [
    '101',
    'listing_101',
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(() => api.reserveProduct(id, 1, 2, pickup, ''));
    await assert.rejects(() => api.reserveProduct(101, id, 2, pickup, ''));
  }
  assert.equal(calls.length, count);
  failure = new ApiError(409);
  await assert.rejects(() => api.reserveProduct(101, 1, 2, pickup, ''), /품절/);
  session = null;
  await assert.rejects(
    () => api.reserveProduct(101, 1, 2, pickup, ''),
    /로그인/,
  );
  console.log(
    'PASS: integer IDs, 201 expectation, KST offset, ordinary/recommendation payloads, response mismatch, quantity/auth/conflict guards; no extra event request',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
