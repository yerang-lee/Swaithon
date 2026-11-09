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
  const mock = {};
  let now = Date.now();
  class ClockDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
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
  const verify = (qr, token = merchant) =>
    mock.mockRequest(
      '/reservations/pickup/verify',
      'POST',
      { qr_code_data: qr },
      token,
    );
  const qr = (await get(501)).qr_code_data;
  await assert.rejects(verify(qr, customer), (e) => e.status === 403);
  await assert.rejects(verify('unknown'), (e) => e.status === 404);
  const outcomes = await Promise.allSettled([verify(qr), verify(qr)]);
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((x) => x.status === 'rejected').length, 1);
  assert.equal((await get(501)).status, 'COMPLETED');
  assert.equal((await get(501)).qr_code_data, null);
  await assert.rejects(verify(qr), (e) => e.status === 410);
  const foreign = (await get(506)).qr_code_data;
  await assert.rejects(verify(foreign), (e) => e.status === 403);
  // 새 테스트 고객으로 초기화한 뒤 QR 만료 검증
  mock.setMockMode(true);
  mock.prepareMockAccount('CUSTOMER');
  const newCustomer = (
    await mock.mockRequest('/auth/login', 'POST', { phone: '01000000002' })
  ).access_token;
  const expiring = await mock.mockRequest(
    '/reservations/501',
    'GET',
    undefined,
    newCustomer,
  );
  now += 24 * 3600000;
  await assert.rejects(verify(expiring.qr_code_data), (e) => e.status === 410);
  console.log(
    'PASS: pickup POST/200/Bearer/exact body, merchant/auth guards, response validation, sanitized errors, account change, mock ownership/expiry/single success and completed customer detail without QR',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
