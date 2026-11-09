const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/hooks/useFavorites.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let session = { access_token: 'account-a' },
  requests = [],
  alerts = [];
function task(kind, args) {
  return new Promise((resolve, reject) =>
    requests.push({ kind, args, resolve, reject }),
  );
}
const api = {};
new Function('require', 'exports', source)(
  (name) =>
    name === 'react'
      ? { useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
      : name === 'react-native'
        ? { Alert: { alert: (...values) => alerts.push(values) } }
        : name === '../services/api/auth'
          ? { getAuthSession: () => session }
          : name === '../services/api/favorites'
            ? {
                addFavorite: (...args) => task('add', args),
                cancelFavorite: (...args) => task('cancel', args),
              }
            : { logAppError() {} },
  api,
);
const item = {
  favorite_id: 'favorite_1',
  listing_id: '101',
  product_name: '사과',
  store_name: '가게',
};
(async () => {
  const first = api
    .useFavorites()
    .toggleFavorite('101', { requestId: 'rec_1' });
  assert.deepEqual(api.useFavorites().pendingFavorites, ['101']);
  assert.deepEqual(api.useFavorites().favorites, []);
  await api.useFavorites().toggleFavorite('101');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].args, ['101', 'rec_1']);
  requests[0].resolve(item);
  await first;
  assert.deepEqual(api.useFavorites().favorites, ['101']);
  assert.equal(api.useFavorites().favoriteItems[0].favorite_id, 'favorite_1');
  const cancelling = api
    .useFavorites()
    .toggleFavorite('101', { requestId: 'must-not-send' });
  const cancel = requests.at(-1);
  assert.equal(cancel.kind, 'cancel');
  assert.deepEqual(cancel.args, ['favorite_1', '101']);
  assert.deepEqual(api.useFavorites().favorites, ['101']);
  assert.equal(api.useFavorites().favoriteItems.length, 1);
  await api.useFavorites().toggleFavorite('101');
  assert.equal(requests.at(-1), cancel);
  cancel.resolve({
    favorite_id: 'favorite_1',
    listing_id: '101',
    message: '취소',
  });
  await cancelling;
  assert.deepEqual(api.useFavorites().favorites, []);
  assert.deepEqual(api.useFavorites().favoriteItems, []);
  assert.deepEqual(api.useFavorites().pendingFavorites, []);
  const readd = api.useFavorites().toggleFavorite('101');
  requests.at(-1).resolve({ ...item, favorite_id: 'favorite_2' });
  await readd;
  const failed = api.useFavorites().toggleFavorite('101');
  assert.equal(requests.at(-1).args[0], 'favorite_2');
  requests.at(-1).reject(new Error('취소 실패'));
  await failed;
  assert.deepEqual(api.useFavorites().favorites, ['101']);
  assert.equal(api.useFavorites().favoriteItems[0].favorite_id, 'favorite_2');
  assert.deepEqual(api.useFavorites().pendingFavorites, []);
  assert.equal(alerts.length, 1);
  const failedAdd = api.useFavorites().toggleFavorite('102');
  requests.at(-1).reject(new Error('연결 실패'));
  await failedAdd;
  assert.deepEqual(api.useFavorites().favorites, ['101']);
  const old = api.useFavorites().toggleFavorite('101');
  const stale = requests.at(-1);
  api.clearFavorites();
  session = { access_token: 'account-b' };
  const current = api.useFavorites().toggleFavorite('101');
  requests.at(-1).resolve({ ...item, favorite_id: 'favorite_new_account' });
  await current;
  stale.resolve({
    favorite_id: 'favorite_2',
    listing_id: '101',
    message: '취소',
  });
  await old;
  assert.equal(
    api.useFavorites().favoriteItems[0].favorite_id,
    'favorite_new_account',
  );
  assert.deepEqual(api.useFavorites().favorites, ['101']);
  const switched = api.useFavorites().toggleFavorite('104');
  session = { access_token: 'account-c' };
  requests.at(-1).resolve({ ...item, listing_id: '104' });
  await switched;
  assert.equal(api.useFavorites().favorites.includes('104'), false);
  api.clearFavorites();
  const count = requests.length;
  await api.useFavorites().toggleFavorite('apple', { preview: true });
  assert.deepEqual(api.useFavorites().favorites, ['apple']);
  await api.useFavorites().toggleFavorite('apple', { preview: true });
  assert.deepEqual(api.useFavorites().favorites, []);
  assert.equal(requests.length, count);
  api.clearFavorites();
  const numericAdd = api.useFavorites().toggleFavorite('7');
  requests.at(-1).resolve({
    favorite_id: 8,
    user_id: 6,
    listing_id: 7,
    product_id: 2,
    store_id: 1,
    product_name: '배추',
    store_name: '상점1',
    created_at: '2026-11-09T10:59:37.475129+09:00',
  });
  await numericAdd;
  assert.deepEqual(api.useFavorites().favorites, ['7']);
  assert.equal(api.useFavorites().favoriteItems[0].favorite_id, '8');
  const numericCancel = api.useFavorites().toggleFavorite('7');
  assert.deepEqual(requests.at(-1).args, ['8', '7']);
  requests
    .at(-1)
    .resolve({ favorite_id: '8', listing_id: '7', message: '취소' });
  await numericCancel;
  assert.deepEqual(api.useFavorites().favorites, []);
  console.log(
    'PASS: add/cancel server-confirmed state, favorite ID mapping, no duplicate taps, failure keeps favorite, re-add IDs, stale cancellation/account isolation, preview-only toggles',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
