const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
class ApiError extends Error {
  constructor(status) {
    super('알림 요청 오류');
    this.status = status;
  }
}
const jsx = (type, props, key) => ({ type, props, key });
let slots = [],
  refs = [],
  cursor = 0,
  refCursor = 0,
  focus,
  session = { access_token: 'owner' },
  requests = [],
  reads = [],
  routes = [];
const modules = {
  react: {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        },
      ];
    },
    useRef: (value) => {
      const i = refCursor++;
      return (refs[i] ??= { current: value });
    },
    useCallback: (fn) => fn,
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    StyleSheet: { create: (s) => s },
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    FlatList: 'FlatList',
    ActivityIndicator: 'ActivityIndicator',
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: {
      canGoBack: () => true,
      back: () => routes.push('back'),
      replace: (path) => routes.push(path),
    },
    useFocusEffect: (fn) => (focus = fn),
  },
  '../components/ui/PageHeader': { PageHeader: 'PageHeader' },
  '../services/api/auth': { getAuthSession: () => session },
  '../services/api/client': { ApiError },
  '../services/api/notifications': {
    getNotifications: (options) =>
      new Promise((resolve, reject) =>
        requests.push({ options, resolve, reject }),
      ),
    markNotificationRead: (id) =>
      new Promise((resolve, reject) => reads.push({ id, resolve, reject })),
  },
  '../utils/appDiagnostics': { logAppError() {} },
};
const api = {};
new Function('require', 'exports', compile('src/app/notifications.tsx'))(
  (name) => modules[name] ?? {},
  api,
);
function walk(node) {
  return !node || typeof node !== 'object'
    ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
}
function text(node) {
  return typeof node === 'string'
    ? node
    : node && typeof node === 'object'
      ? [node.props?.children].flat(Infinity).map(text).join('')
      : '';
}
function render() {
  cursor = 0;
  refCursor = 0;
  const tree = api.default();
  const list = walk(tree).find((node) => node.type === 'FlatList').props;
  const content = jsx('View', {
    children: [
      list.ListHeaderComponent,
      list.data.length ? null : list.ListEmptyComponent,
      ...list.data.map((item) => list.renderItem({ item })),
      list.ListFooterComponent,
    ],
  });
  return { tree, list, content };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const items = Array.from({ length: 10 }, (_, i) => ({
  notification_id: 201 + i,
  type: 'RESERVATION',
  title: `알림${i}`,
  content: '예약 상품을 확인하세요.',
  related_id: 501,
  is_read: i === 1,
  created_at: '2026-11-03T14:30:00',
}));
const page = (notifications, total_count = 12, page = 1) => ({
  notifications,
  total_count,
  page,
  size: 10,
  unread_count: 11,
});
const button = (view, label) =>
  walk(view.content).find(
    (node) => node.type === 'Pressable' && text(node) === label,
  );
(async () => {
  let view = render();
  const header = walk(view.tree).find(
    (node) => node.type === 'PageHeader',
  ).props;
  assert.equal(header.title, '알림');
  header.onBack();
  assert.equal(routes[0], 'back');
  let cleanup = focus();
  assert.deepEqual(requests[0].options, { page: 1, size: 10 });
  requests.shift().resolve(page(items));
  await tick();
  view = render();
  assert.equal(view.list.data.length, 10);
  const row = () =>
    walk(render().content).find(
      (node) => node.props?.accessibilityLabel === '읽지 않은 알림, 알림0',
    );
  row().props.onPress();
  row().props.onPress();
  assert.equal(reads.length, 1);
  assert.equal(row().props.disabled, true);
  view = render();
  button(view, '알림 더 보기').props.onPress();
  assert.equal(requests[0].options.page, 2);
  reads.shift().resolve({ is_read: true });
  await tick();
  requests
    .shift()
    .resolve(
      page(
        [
          items[0],
          { ...items[0], notification_id: 211, title: '추가1' },
          { ...items[0], notification_id: 212, title: '추가2' },
        ],
        12,
        2,
      ),
    );
  await tick();
  view = render();
  assert.equal(view.list.data.length, 12);
  assert.equal(
    view.list.data.find((item) => item.notification_id === 201).is_read,
    true,
  );
  walk(view.content)
    .find((node) => node.props?.accessibilityLabel === '읽지 않은 알림, 알림2')
    .props.onPress();
  reads.shift().reject(new ApiError(500));
  await tick();
  view = render();
  assert.ok(text(view.content).includes('알림 요청 오류'));
  assert.equal(
    view.list.data.find((item) => item.notification_id === 203).is_read,
    false,
  );
  view.list.onRefresh();
  assert.equal(requests[0].options.page, 1);
  requests.shift().reject(new ApiError(500));
  await tick();
  view = render();
  button(view, '다시 시도').props.onPress();
  assert.equal(requests[0].options.page, 1);
  requests.shift().resolve(page([], 0));
  await tick();
  view = render();
  assert.ok(text(view.content).includes('알림이 없어요.'));
  assert.equal(view.list.ListEmptyComponent.props.style.textAlign, 'center');
  view.list.onRefresh();
  requests.shift().reject(new ApiError(401));
  await tick();
  view = render();
  button(view, '로그인하기').props.onPress();
  assert.equal(routes.at(-1), '/login');
  view.list.onRefresh();
  const stale = requests.shift();
  cleanup();
  stale.resolve(page(items));
  await tick();
  assert.equal(render().list.data.length, 0);
  session = { access_token: 'other' };
  render();
  cleanup = focus();
  requests.shift().resolve(page([], 0));
  await tick();
  assert.equal(render().list.data.length, 0);
  cleanup();
  // The actual shared bell opens this route; the notification page omits a recursive bell.
  let badgeCount = 0;
  const headerApi = {};
  new Function(
    'require',
    'exports',
    compile('src/components/ui/PageHeader.tsx'),
  )(
    (name) =>
      name === '../../hooks/useUnreadNotifications'
        ? { useUnreadNotifications: () => badgeCount }
        : name === 'react-native'
          ? {
              View: 'View',
              Text: 'Text',
              Pressable: 'Pressable',
              StyleSheet: { create: (s) => s },
            }
          : name === 'expo-router'
            ? { router: { push: (path) => routes.push(path) } }
            : name === 'react/jsx-runtime'
              ? { jsx, jsxs: jsx }
              : {},
    headerApi,
  );
  walk(headerApi.PageHeader({ title: '홈' }))
    .find((node) => node.props?.accessibilityLabel === '알림')
    .props.onPress();
  assert.equal(routes.at(-1), '/notifications');
  badgeCount = 2;
  const unreadHeader = headerApi.PageHeader({ title: '홈' });
  assert.ok(
    walk(unreadHeader).some(
      (node) => node.props?.testID === 'notification-unread-dot',
    ),
  );
  assert.ok(
    walk(unreadHeader).some(
      (node) => node.props?.accessibilityLabel === '알림, 읽지 않은 알림 2개',
    ),
  );
  badgeCount = 0;
  assert.equal(
    walk(headerApi.PageHeader({ title: '홈' })).some(
      (node) => node.props?.testID === 'notification-unread-dot',
    ),
    false,
  );
  assert.equal(
    walk(
      headerApi.PageHeader({
        title: '알림',
        onBack() {},
        rightAction: jsx('View', {}),
      }),
    ).some((node) => node.props?.accessibilityLabel === '알림'),
    false,
  );
  console.log(
    'PASS: bell navigation/back/header, notifications pagination/read locks/success-only state, stale-list read protection, correct refresh retry, centered empty/login/error and stale-visit isolation',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
