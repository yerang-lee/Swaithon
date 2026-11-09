const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
class ApiError extends Error {
  constructor(status) {
    super('request failed');
    this.status = status;
  }
}
const original = {
  reservation_id: 501,
  listing_id: 101,
  product_id: 1,
  product_name: '사과 1kg',
  store_id: 1,
  store_name: '과일가게',
  quantity: 2,
  total_price: 10000,
  status: 'READY',
  created_at: '2026-11-03T13:00:00+09:00',
  qr_code_data: 'pickup_test_server_value',
  qr_code_expires_at: '2099-11-04T14:30:00+09:00',
};
let session = { access_token: 'customer', expiresAt: Date.now() + 60000 },
  response = structuredClone(original),
  calls = [],
  failure,
  change = false;
const api = {};
new Function('require', 'exports', compile('src/services/api/reservations.ts'))(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          getJson: async (...args) => {
            calls.push(args);
            if (failure) throw failure;
            if (change)
              session = { ...session, access_token: 'another-account' };
            return response;
          },
        },
  api,
);
(async () => {
  assert.deepEqual(await api.getReservationDetail(501), original);
  assert.deepEqual(calls[0], ['/reservations/501', 'customer']);
  for (const status of ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']) {
    response = {
      ...original,
      status,
      qr_code_data: null,
      qr_code_expires_at: null,
    };
    assert.equal((await api.getReservationDetail(501)).qr_code_data, null);
    response = { ...response, qr_code_data: 'must-not-display' };
    await assert.rejects(api.getReservationDetail(501), /응답/);
  }
  for (const patch of [
    { reservation_id: 502 },
    { listing_id: '101' },
    { quantity: 0 },
    { total_price: -1 },
    { qr_code_data: null },
    { qr_code_expires_at: 'bad' },
    { status: 'UNKNOWN' },
  ]) {
    response = { ...original, ...patch };
    await assert.rejects(api.getReservationDetail(501), /응답/);
  }
  response = { ...original, qr_code_expires_at: '2020-01-01T00:00:00+09:00' };
  assert.equal(
    (await api.getReservationDetail(501)).qr_code_expires_at,
    response.qr_code_expires_at,
  );
  for (const id of [0, -1, 'reservation_501'])
    await assert.rejects(api.getReservationDetail(id), /ID/);
  for (const status of [401, 403, 404, 500]) {
    failure = new ApiError(status);
    await assert.rejects(
      api.getReservationDetail(501),
      (error) => error.status === status,
    );
  }
  failure = null;
  session = null;
  await assert.rejects(
    api.getReservationDetail(501),
    (error) => error.status === 401,
  );
  session = { access_token: 'expired', expiresAt: 0 };
  await assert.rejects(
    api.getReservationDetail(501),
    (error) => error.status === 401,
  );
  session = { access_token: 'customer', expiresAt: Date.now() + 60000 };
  change = true;
  await assert.rejects(api.getReservationDetail(501), /계정이 변경/);
  let now = Date.now();
  class ClockDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
  const mock = {};
  new Function(
    'require',
    'exports',
    '__DEV__',
    'process',
    'Date',
    'setTimeout',
    compile('src/services/devMock.ts'),
  )(
    () => ({}),
    mock,
    true,
    { env: {} },
    ClockDate,
    (fn) => {
      fn();
      return 0;
    },
  );
  const token = (
    await mock.mockRequest('/auth/login', 'POST', { phone: '01000000002' })
  ).access_token;
  const get = (id, access = token) =>
    mock.mockRequest(`/reservations/${id}`, 'GET', undefined, access);
  const list = await mock.mockRequest(
    '/users/me/reservations?page=1&size=10',
    'GET',
    undefined,
    token,
  );
  assert.equal(list.reservations[0].status, 'READY');
  assert.equal(list.reservations[0].reservation_id, 501);
  const first = await get(501),
    same = await get(501);
  assert.equal(first.qr_code_data, same.qr_code_data);
  assert.ok(first.qr_code_data.startsWith('TEST_ONLY_PICKUP_'));
  assert.equal(Date.parse(first.qr_code_expires_at) - now, 24 * 60 * 60 * 1000);
  now += 24 * 60 * 60 * 1000 + 1;
  const renewed = await get(501);
  assert.notEqual(renewed.qr_code_data, first.qr_code_data);
  assert.equal(
    Date.parse(renewed.qr_code_expires_at) - now,
    24 * 60 * 60 * 1000,
  );
  for (const id of [502, 503, 504, 505]) {
    const detail = await get(id);
    assert.equal(detail.qr_code_data, null);
    assert.equal(detail.qr_code_expires_at, null);
  }
  await mock.mockRequest('/reservations/501/cancel', 'PATCH', undefined, token);
  const cancelled = await get(501);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.qr_code_data, null);
  const merchant = (
    await mock.mockRequest('/auth/login', 'POST', { phone: '01000000001' })
  ).access_token;
  await assert.rejects(get(501, merchant), (error) => error.status === 403);
  await assert.rejects(get(999), (error) => error.status === 404);
  await assert.rejects(get(501, ''), (error) => error.status === 401);
  console.log(
    'PASS: reservation detail GET/Bearer/integer IDs, state-dependent QR nullability, schema/errors/account guards, mock READY-only preview, 24-hour reuse/renewal, cancellation and ownership',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
