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
  console.log('PASS: reservation-detail-api server API regression checks');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
