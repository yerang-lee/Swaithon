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
let response = {
  reservation_id: 503,
  status: 'READY',
  updated_at: '2026-11-03T14:30:00',
  message: '준비 완료',
};
class ApiError extends Error {
  constructor(status, message = 'private response') {
    super(message);
    this.status = status;
  }
}
new Function('require', 'exports', compile('src/services/api/reservations.ts'))(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          patchJson: async (...args) => {
            calls.push(args);
            if (failure) throw failure;
            if (changeAccount) session = { ...session, access_token: 'other' };
            return response;
          },
        },
  api,
);
(async () => {
  assert.equal(
    (await api.changeReservationStatus(503, 'READY')).status,
    'READY',
  );
  assert.deepEqual(calls[0], [
    '/reservations/503/status',
    { status: 'READY' },
    'merchant',
    200,
  ]);
  const original = response;
  for (const invalid of [
    { ...original, reservation_id: 504 },
    { ...original, status: 'CONFIRMED' },
    { ...original, updated_at: null },
    { ...original, message: 1 },
  ]) {
    response = invalid;
    await assert.rejects(
      () => api.changeReservationStatus(503, 'READY'),
      /확인/,
    );
  }
  response = original;
  for (const code of [400, 401, 403, 404, 409, 500]) {
    failure = new ApiError(code);
    await assert.rejects(
      () => api.changeReservationStatus(503, 'READY'),
      (e) => e.status === code && !e.message.includes('private'),
    );
  }
  failure = null;
  const count = calls.length;
  for (const id of [0, -1, '503', 1.5])
    await assert.rejects(() => api.changeReservationStatus(id, 'READY'));
  await assert.rejects(() => api.changeReservationStatus(503, 'INVALID'));
  session.role = 'CUSTOMER';
  await assert.rejects(
    () => api.changeReservationStatus(503, 'READY'),
    (e) => e.status === 403,
  );
  session = null;
  await assert.rejects(
    () => api.changeReservationStatus(503, 'READY'),
    (e) => e.status === 401,
  );
  assert.equal(calls.length, count);
  session = {
    access_token: 'merchant',
    role: 'MERCHANT',
    expiresAt: Date.now() + 60000,
  };
  changeAccount = true;
  await assert.rejects(() => api.changeReservationStatus(503, 'READY'), /계정/);

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
  const customer = (
    await mock.mockRequest('/auth/login', 'POST', { phone: '01000000002' })
  ).access_token;
  const merchant = (
    await mock.mockRequest('/auth/login', 'POST', { phone: '01000000001' })
  ).access_token;
  const get = (id) =>
    mock.mockRequest(`/reservations/${id}`, 'GET', undefined, customer);
  const patch = (id, status, token = merchant) =>
    mock.mockRequest(`/reservations/${id}/status`, 'PATCH', { status }, token);
  assert.equal((await get(503)).status, 'PENDING');
  await assert.rejects(patch(503, 'READY'), (e) => e.status === 409);
  await assert.rejects(
    patch(503, 'CONFIRMED', customer),
    (e) => e.status === 403,
  );
  await assert.rejects(patch(506, 'CONFIRMED'), (e) => e.status === 403);
  await assert.rejects(patch(999999, 'READY'), (e) => e.status === 404);
  await assert.rejects(patch(503, 'UNKNOWN'), (e) => e.status === 400);
  assert.equal((await patch(503, 'CONFIRMED')).status, 'CONFIRMED');
  assert.equal((await get(503)).qr_code_data, null);
  const issuedAt = now;
  const ready = await patch(503, 'READY');
  assert.equal(ready.status, 'READY');
  assert.equal(ready.qr_code_data, undefined);
  now += 3600000;
  const qr = await get(503);
  assert.equal(Date.parse(qr.qr_code_expires_at), issuedAt + 24 * 3600000);
  assert.equal((await get(503)).qr_code_data, qr.qr_code_data);
  await assert.rejects(patch(503, 'READY'), (e) => e.status === 409);
  now = issuedAt + 24 * 3600000;
  const renewed = await get(503);
  assert.notEqual(renewed.qr_code_data, qr.qr_code_data);
  assert.equal(Date.parse(renewed.qr_code_expires_at), now + 24 * 3600000);
  const verify = (data) =>
    mock.mockRequest(
      '/reservations/pickup/verify',
      'POST',
      { qr_code_data: data },
      merchant,
    );
  await assert.rejects(verify(qr.qr_code_data), (e) => e.status === 410);
  assert.equal((await verify(renewed.qr_code_data)).status, 'COMPLETED');
  assert.equal((await get(503)).qr_code_data, null);
  await assert.rejects(patch(503, 'READY'), (e) => e.status === 409);
  await patch(505, 'READY');
  const cancelledQr = await get(505);
  await mock.mockRequest(
    '/reservations/505/cancel',
    'PATCH',
    undefined,
    customer,
  );
  assert.equal((await get(505)).qr_code_data, null);
  await assert.rejects(
    verify(cancelledQr.qr_code_data),
    (e) => e.status === 410,
  );
  console.log(
    'PASS: merchant PATCH/Bearer/exact body/200, schema and status errors, account guards, PENDING→CONFIRMED→READY, QR issued at READY for 24h, renewal and invalidation after completion/cancellation',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
