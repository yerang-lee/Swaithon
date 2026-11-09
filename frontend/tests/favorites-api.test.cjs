const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/services/api/favorites.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let session = { access_token: 'test-token', expiresAt: Date.now() + 60000 },
  payload,
  failure,
  call,
  afterRequest;
class ApiError extends Error {
  constructor(status, message) {
    super(message);
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
            call = args;
            if (failure) throw failure;
            afterRequest?.();
            return payload;
          },
          deleteJson: async (...args) => {
            call = args;
            if (failure) throw failure;
            afterRequest?.();
            return payload;
          },
        },
  api,
);
const favorite = {
  favorite_id: 'favorite_1',
  user_id: 'user_5',
  listing_id: 'listing_101',
  product_id: 'product_apple',
  store_id: 'store_1',
  product_name: '사과',
  store_name: '가게',
  created_at: '2026-11-03T10:00:00+09:00',
  message: '추가되었습니다.',
};
(async () => {
  payload = favorite;
  assert.deepEqual(await api.addFavorite(' listing_101 '), favorite);
  assert.deepEqual(call, [
    '/favorites',
    { listing_id: 'listing_101' },
    'test-token',
    201,
  ]);
  await api.addFavorite('listing_101', ' rec_1 ');
  assert.deepEqual(call[1], { listing_id: 'listing_101', request_id: 'rec_1' });
  await api.addFavorite('listing_101', ' ');
  assert.deepEqual(call[1], { listing_id: 'listing_101' });
  for (const status of [400, 401, 404, 409, 500]) {
    failure = new ApiError(status, 'private server response');
    await assert.rejects(
      () => api.addFavorite('listing_101'),
      (e) => e.status === status && !e.message.includes('private'),
    );
  }
  failure = undefined;
  for (const change of [
    { favorite_id: 1 },
    { user_id: null },
    { listing_id: 'other' },
    { store_id: undefined },
    { created_at: 'invalid' },
    { message: null },
  ]) {
    payload = { ...favorite, ...change };
    await assert.rejects(() => api.addFavorite('listing_101'), /응답/);
  }
  payload = favorite;
  await assert.rejects(() => api.addFavorite(' '));
  await assert.rejects(() => api.addFavorite('listing_101', 123));
  session = null;
  await assert.rejects(
    () => api.addFavorite('listing_101'),
    (e) => e.status === 401,
  );
  session = { access_token: 'test-token', expiresAt: Date.now() - 1 };
  await assert.rejects(
    () => api.addFavorite('listing_101'),
    (e) => e.status === 401,
  );
  session = { access_token: 'test-token', expiresAt: Date.now() + 60000 };
  afterRequest = () => {
    session = { ...session, access_token: 'new-account' };
  };
  await assert.rejects(() => api.addFavorite('listing_101'), /계정이 변경/);
  afterRequest = undefined;
  session = { access_token: 'test-token', expiresAt: Date.now() + 60000 };
  const cancelled = {
    favorite_id: 'favorite/1',
    listing_id: 'listing_101',
    message: '취소되었습니다.',
  };
  payload = cancelled;
  assert.deepEqual(
    await api.cancelFavorite(' favorite/1 ', 'listing_101'),
    cancelled,
  );
  assert.deepEqual(call, ['/favorites/favorite%2F1', 'test-token', 200]);
  for (const status of [401, 403, 404, 500]) {
    failure = new ApiError(status, 'private server response');
    await assert.rejects(
      () => api.cancelFavorite('favorite/1', 'listing_101'),
      (e) => e.status === status && !e.message.includes('private'),
    );
  }
  failure = undefined;
  for (const change of [
    { favorite_id: 'wrong' },
    { listing_id: 'other' },
    { listing_id: 101 },
    { message: null },
  ]) {
    payload = { ...cancelled, ...change };
    await assert.rejects(
      () => api.cancelFavorite('favorite/1', 'listing_101'),
      /취소 응답/,
    );
  }
  await assert.rejects(() => api.cancelFavorite(' ', 'listing_101'));
  await assert.rejects(() => api.cancelFavorite('favorite/1', ' '));
  session = null;
  await assert.rejects(
    () => api.cancelFavorite('favorite/1', 'listing_101'),
    (e) => e.status === 401,
  );
  session = { access_token: 'test-token', expiresAt: Date.now() - 1 };
  await assert.rejects(
    () => api.cancelFavorite('favorite/1', 'listing_101'),
    (e) => e.status === 401,
  );
  session = { access_token: 'test-token', expiresAt: Date.now() + 60000 };
  payload = cancelled;
  afterRequest = () => {
    session = { ...session, access_token: 'new-account' };
  };
  await assert.rejects(
    () => api.cancelFavorite('favorite/1', 'listing_101'),
    /계정이 변경/,
  );
  console.log(
    'PASS: favorite POST/201/Bearer, request ID omission/forwarding, strict response IDs/date, error messages, missing/expired session and account changes, DELETE path ID/200/response matching and cancellation errors',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
