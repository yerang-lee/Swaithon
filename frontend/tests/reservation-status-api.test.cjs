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
  console.log('PASS: reservation-status-api server API regression checks');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
