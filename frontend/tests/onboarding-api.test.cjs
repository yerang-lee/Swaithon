const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
let session = { access_token: 'token', expiresAt: Date.now() + 60000 },
  body,
  statusExpected,
  changedRole,
  response;
class ApiError extends Error {
  constructor(status) {
    super('error');
    this.status = status;
  }
}
const api = {};
new Function('require', 'exports', compile('src/services/api/onboarding.ts'))(
  (name) =>
    name === './auth'
      ? {
          getAuthSession: () => session,
          setAuthRole: (role) => (changedRole = role),
        }
      : {
          ApiError,
          patchJson: async (p, b, t, s) => {
            assert.equal(p, '/users/me/onboarding');
            assert.equal(t, 'token');
            body = b;
            statusExpected = s;
            return response;
          },
        },
  api,
);
const merchant = {
  role: 'MERCHANT',
  kakao_place_id: '18526234',
  market_name: '망원시장',
  address: '서울 마포구 망원동 414-8',
  latitude: 37.555,
  longitude: 126.906,
  store_name: '과일가게',
  description: ' 신선한 과일 ',
};
(async () => {
  response = {
    user_id: 1,
    role: 'CUSTOMER',
    market_id: null,
    store_id: null,
    store_name: null,
    onboarding_completed: true,
  };
  await api.registerOnboarding({
    role: 'CUSTOMER',
    market_id: 99,
    store_name: 'must omit',
  });
  assert.deepEqual(body, { role: 'CUSTOMER' });
  assert.equal(statusExpected, 200);
  response = {
    user_id: 1,
    role: 'MERCHANT',
    market_id: 5,
    store_id: 1,
    store_name: '과일가게',
    onboarding_completed: true,
  };
  await api.registerOnboarding(merchant);
  assert.equal(body.kakao_place_id, '18526234');
  assert.equal(body.latitude, merchant.latitude);
  assert.equal(body.description, '신선한 과일');
  assert.equal(body.market_id, undefined);
  assert.equal(body.store_id, undefined);
  assert.equal(changedRole, 'MERCHANT');
  await assert.rejects(() =>
    api.registerOnboarding({ ...merchant, address: '' }),
  );
  await assert.rejects(() =>
    api.registerOnboarding({ ...merchant, latitude: 91 }),
  );
  response = { ...response, store_id: null };
  await assert.rejects(() => api.registerOnboarding(merchant), /응답/);
  console.log('PASS: onboarding-api server API regression checks');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
