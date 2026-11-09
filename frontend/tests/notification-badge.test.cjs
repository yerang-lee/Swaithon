const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
const createStore = () => {
  const api = {};
  new Function('exports', compile('src/services/notificationUnread.ts'))(api);
  return api;
};
class ApiError extends Error {
  constructor(status) {
    super('request failed');
    this.status = status;
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  const store = createStore();
  let updates = 0;
  const unsubscribe = store.subscribeUnread(() => updates++);
  store.receiveUnreadCount(store.beginUnreadLoad('a'), 2, [
    { notification_id: 1, is_read: false },
    { notification_id: 2, is_read: false },
  ]);
  assert.equal(store.getUnreadSnapshot().count, 2);
  const older = store.beginUnreadLoad('a'),
    newer = store.beginUnreadLoad('a');
  store.receiveUnreadCount(newer, 3);
  store.receiveUnreadCount(older, 9);
  assert.equal(store.getUnreadSnapshot().count, 3);
  const oldCount = store.beginUnreadLoad('a');
  const read = store.beginUnreadRead('a', 1);
  assert.equal(store.getUnreadSnapshot().pending, 1);
  store.receiveUnreadCount(oldCount, 9);
  store.finishUnreadRead(read, true);
  assert.equal(store.getUnreadSnapshot().count, 2);
  assert.equal(store.getUnreadSnapshot().pending, 0);
  store.finishUnreadRead(store.beginUnreadRead('a', 1), true);
  assert.equal(store.getUnreadSnapshot().count, 2);
  store.finishUnreadRead(store.beginUnreadRead('a', 2), false);
  assert.equal(store.getUnreadSnapshot().count, 2);
  store.receiveUnreadCount(store.beginUnreadLoad('a'), 1, [
    { notification_id: 2, is_read: false },
  ]);
  store.finishUnreadRead(store.beginUnreadRead('a', 2), true);
  assert.equal(store.getUnreadSnapshot().count, 0);
  const stale = store.beginUnreadLoad('a');
  const current = store.beginUnreadLoad('b');
  store.receiveUnreadCount(stale, 100);
  assert.equal(store.getUnreadSnapshot().count, null);
  store.receiveUnreadCount(current, 4);
  assert.equal(store.getUnreadSnapshot().count, 4);
  unsubscribe();
  const before = updates;
  store.hideUnreadCount('b');
  assert.equal(updates, before);
  const shared = createStore(),
    hook = {},
    app = { currentState: 'active' },
    listeners = new Set(),
    intervals = new Map();
  let session = { access_token: 'owner', expiresAt: Date.now() + 60000 },
    focus,
    requestId = 0,
    requests = [],
    calls = [];
  app.addEventListener = (_, callback) => {
    listeners.add(callback);
    return { remove: () => listeners.delete(callback) };
  };
  new Function(
    'require',
    'exports',
    'setInterval',
    'clearInterval',
    compile('src/hooks/useUnreadNotifications.ts'),
  )(
    (name) => {
      if (name === 'react')
        return {
          useCallback: (fn) => fn,
          useSyncExternalStore: (_, snapshot) => snapshot(),
        };
      if (name === 'react-native') return { AppState: app };
      if (name === 'expo-router')
        return { useFocusEffect: (fn) => (focus = fn) };
      if (name === '../services/api/auth')
        return { getAuthSession: () => session };
      if (name === '../services/api/client') return { ApiError };
      if (name === '../services/notificationUnread') return shared;
      if (name === '../services/api/notifications')
        return {
          getNotifications: (options) => {
            calls.push(options);
            const context = shared.beginUnreadLoad(session.access_token);
            return new Promise((resolve, reject) =>
              requests.push({
                resolve: (count) => {
                  shared.receiveUnreadCount(context, count, [
                    { notification_id: 1, is_read: false },
                  ]);
                  resolve({ unread_count: count });
                },
                reject,
              }),
            );
          },
        };
      return { logAppError() {} };
    },
    hook,
    (callback) => {
      const id = ++requestId;
      intervals.set(id, callback);
      return id;
    },
    (id) => intervals.delete(id),
  );
  assert.equal(hook.useUnreadNotifications(), 0);
  let cleanup = focus();
  hook.useUnreadNotifications();
  let second = focus();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { page: 1, size: 1 });
  requests.shift().resolve(2);
  await tick();
  assert.equal(hook.useUnreadNotifications(), 2);
  app.currentState = 'background';
  [...intervals.values()].forEach((fn) => fn());
  assert.equal(calls.length, 1);
  app.currentState = 'active';
  [...listeners].forEach((fn) => fn('active'));
  assert.equal(calls.length, 2);
  requests.shift().resolve(2);
  await tick();
  cleanup();
  second();
  shared.finishUnreadRead(shared.beginUnreadRead('owner', 1), true);
  assert.equal(hook.useUnreadNotifications(), 1);
  cleanup = focus();
  assert.equal(calls.length, 3);
  requests.shift().resolve(0);
  await tick();
  assert.equal(hook.useUnreadNotifications(), 0);
  [...intervals.values()].forEach((fn) => fn());
  const oldRequest = requests.shift();
  cleanup();
  session = { access_token: 'other', expiresAt: Date.now() + 60000 };
  assert.equal(hook.useUnreadNotifications(), 0);
  cleanup = focus();
  oldRequest.resolve(8);
  await tick();
  assert.equal(hook.useUnreadNotifications(), 0);
  requests.shift().resolve(1);
  await tick();
  assert.equal(hook.useUnreadNotifications(), 1);
  [...intervals.values()].forEach((fn) => fn());
  requests.shift().reject(new ApiError(401));
  await tick();
  assert.equal(hook.useUnreadNotifications(), 0);
  cleanup();
  const count = calls.length;
  assert.equal(hook.useUnreadNotifications(false), 0);
  focus();
  assert.equal(calls.length, count);
  assert.equal(intervals.size, 0);
  console.log(
    'PASS: unread server snapshots, stale-response/read races, last-read clearing, duplicate read protection, shared request dedupe, focus/resume/foreground polling, disabled bells and account isolation',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
