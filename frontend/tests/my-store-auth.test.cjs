const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/services/api/auth.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let profile = { role: 'MERCHANT', store_id: 12 };
let sequence = 0;
let reads = 0;
let pending;
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const api = {};
new Function('require', 'exports', source)(
  (name) =>
    name === './client'
      ? {
          ApiError,
          getJson: async () => {
            reads++;
            return pending ? pending : profile;
          },
          postJson: async () => ({
            access_token: `account-${++sequence}`,
            refresh_token: 'refresh',
            token_type: 'bearer',
            expires_in: 3600,
          }),
        }
      : { logAppError() {} },
  api,
);
(async () => {
  await api.login('01000000001', 'password');
  assert.equal(await api.getMyStoreId(), 12);
  const cachedReads = reads;
  assert.equal(await api.getMyStoreId(), 12);
  assert.equal(reads, cachedReads);
  api.setAuthRole('MERCHANT', 'old-account', 99);
  assert.equal(await api.getMyStoreId(), 12);
  api.setAuthRole('MERCHANT', api.getAuthSession().access_token, 34);
  assert.equal(await api.getMyStoreId(), 34);
  profile = { role: 'CUSTOMER', store_id: 12 };
  await api.login('01000000002', 'password');
  assert.equal(api.getAuthSession().storeId, undefined);
  await assert.rejects(api.getMyStoreId(), /상인/);
  profile = { role: 'MERCHANT' };
  await api.login('01000000001', 'password');
  await assert.rejects(api.getMyStoreId(), /가게 ID/);
  let resolve;
  pending = new Promise((done) => {
    resolve = done;
  });
  const lookup = api.getMyStoreId();
  api.clearAuthSession();
  resolve({ role: 'MERCHANT', store_id: 12 });
  await assert.rejects(lookup, /계정이 변경/);
  assert.equal(api.getAuthSession(), null);
  console.log(
    'PASS: owner store cache, customer exclusion, fresh login, missing store ID, stale token and logout during lookup',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
