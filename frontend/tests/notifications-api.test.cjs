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
const item = {
  notification_id: 201,
  type: 'RESERVATION',
  title: '상품이 준비되었습니다.',
  content: '예약 상품을 확인하세요.',
  related_id: 501,
  is_read: false,
  created_at: '2026-11-03T14:30:00',
};
let session = { access_token: 'owner', expiresAt: Date.now() + 60000 },
  response = {
    notifications: [item],
    unread_count: 1,
    total_count: 1,
    page: 1,
    size: 10,
  },
  calls = [],
  failure = null,
  changed = false;
const unreadState = {};
new Function('exports', compile('src/services/notificationUnread.ts'))(unreadState);
const api = {};
new Function(
  'require',
  'exports',
  compile('src/services/api/notifications.ts'),
)(
  (name) =>
    name === '../notificationUnread'
      ? unreadState
      : name === './auth'
        ? { getAuthSession: () => session }
        : {
            ApiError,
            getJson: async (url, token) => {
              calls.push({ url, token });
              if (failure) throw failure;
              if (changed) session = { ...session, access_token: 'other' };
              return response;
            },
            patchJson: async (url, body, token, status) => {
              calls.push({ url, body, token, status });
              if (failure) throw failure;
              return response;
            },
          },
  api,
);
(async () => {
  assert.deepEqual(await api.getNotifications(), response);
  assert.equal(unreadState.getUnreadSnapshot().count, 1);
  assert.deepEqual(calls[0], {
    url: '/users/me/notifications?page=1&size=10',
    token: 'owner',
  });
  response = {
    notifications: [item],
    unread_count: 1,
    total_count: 1,
    page: 2,
    size: 5,
  };
  await api.getNotifications({ page: 2, size: 5, is_read: false });
  assert.equal(
    new URL(calls.at(-1).url, 'https://test.invalid').searchParams.get(
      'is_read',
    ),
    'false',
  );
  response = {
    notifications: [],
    unread_count: 1,
    total_count: 0,
    page: 1,
    size: 10,
  };
  assert.equal(
    (await api.getNotifications({ is_read: true })).notifications.length,
    0,
  );
  for (const options of [{ page: 0 }, { size: -1 }, { is_read: 'false' }])
    await assert.rejects(api.getNotifications(options), /조건/);
  for (const patch of [
    { notification_id: '201' },
    { related_id: null },
    { is_read: null },
    { created_at: 'bad' },
  ]) {
    response = {
      notifications: [{ ...item, ...patch }],
      unread_count: 1,
      total_count: 1,
      page: 1,
      size: 10,
    };
    await assert.rejects(api.getNotifications(), /응답/);
  }
  response = {
    notification_id: 201,
    is_read: true,
    read_at: '2026-11-03T15:00:00',
    message: '읽음 처리했습니다.',
  };
  assert.equal((await api.markNotificationRead(201)).is_read, true);
  assert.equal(unreadState.getUnreadSnapshot().count, 0);
  assert.deepEqual(calls.at(-1), {
    url: '/notifications/201/read',
    body: undefined,
    token: 'owner',
    status: 200,
  });
  response = { ...response, notification_id: 202 };
  await assert.rejects(api.markNotificationRead(201), /결과/);
  for (const status of [401, 403, 404, 500]) {
    failure = new ApiError(status);
    await assert.rejects(
      api.markNotificationRead(201),
      (error) => error.status === status,
    );
  }
  failure = null;
  session = null;
  await assert.rejects(api.getNotifications(), (error) => error.status === 401);
  session = { access_token: 'owner', expiresAt: 0 };
  await assert.rejects(
    api.markNotificationRead(201),
    (error) => error.status === 401,
  );
  session = { access_token: 'owner', expiresAt: Date.now() + 60000 };
  changed = true;
  await assert.rejects(api.getNotifications(), /계정이 변경/);
  changed = false;
  // Exercise the actual shared client: undefined must become no HTTP body.
  const client = {};
  let request;
  new Function(
    'require',
    'exports',
    'fetch',
    'process',
    compile('src/services/api/client.ts'),
  )(
    (name) =>
      ({ logApiError() {} }),
    client,
    async (url, options) => {
      request = { url, ...options };
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            notification_id: 201,
            is_read: true,
            read_at: '2026-11-03T15:00:00',
            message: 'saved',
          }),
      };
    },
    { env: { EXPO_PUBLIC_API_URL: 'https://test.invalid' } },
  );
  await client.patchJson('/notifications/201/read', undefined, 'owner', 200);
  assert.equal(request.method, 'PATCH');
  assert.equal(request.body, undefined);
  assert.equal(request.headers.Authorization, 'Bearer owner');
  console.log('PASS: notifications-api server API regression checks');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
