const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
const api = {};
let session = {
  access_token: 'merchant',
  expiresAt: Date.now() + 60000,
  role: 'MERCHANT',
};
let calls = [],
  failure,
  changed = false;
let response = {
  reservation_id: 501,
  listing_id: 1001,
  product_id: 101,
  product_name: '사과',
  store_name: '가게',
  status: 'COMPLETED',
  completed_at: '2026-11-09T15:00:00+09:00',
  message: '완료',
};
class ApiError extends Error {
  constructor(status) {
    super('private QR response');
    this.status = status;
  }
}
new Function('require', 'exports', compile('src/services/api/pickup.ts'))(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          postJson: async (...args) => {
            calls.push(args);
            if (failure) throw failure;
            if (changed) session = { ...session, access_token: 'other' };
            return response;
          },
        },
  api,
);
(async () => {
  assert.equal((await api.verifyPickup('pickup_token')).status, 'COMPLETED');
  assert.deepEqual(calls[0], [
    '/reservations/pickup/verify',
    { qr_code_data: 'pickup_token' },
    'merchant',
    200,
  ]);
  const original = response;
  for (const invalid of [
    { ...original, status: 'READY' },
    { ...original, reservation_id: '501' },
    { ...original, completed_at: 'invalid' },
  ]) {
    response = invalid;
    await assert.rejects(() => api.verifyPickup('pickup_token'), /확인/);
  }
  response = original;
  for (const status of [400, 401, 403, 404, 409, 410, 500]) {
    failure = new ApiError(status);
    await assert.rejects(
      () => api.verifyPickup('pickup_token'),
      (e) => !e.message.includes('private QR response'),
    );
  }
  failure = null;
  const before = calls.length;
  await assert.rejects(() => api.verifyPickup(''));
  session.role = 'CUSTOMER';
  await assert.rejects(() => api.verifyPickup('pickup_token'));
  session = null;
  await assert.rejects(() => api.verifyPickup('pickup_token'));
  assert.equal(calls.length, before);
  session = {
    access_token: 'merchant',
    expiresAt: Date.now() + 60000,
    role: 'MERCHANT',
  };
  changed = true;
  await assert.rejects(() => api.verifyPickup('pickup_token'));
  console.log('PASS: pickup-verify-api server API regression checks');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
