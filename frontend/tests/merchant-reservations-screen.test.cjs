const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(
      __dirname,
      '../src/components/reservations/MerchantReservationsScreen.tsx',
    ),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
let states = [],
  refs = [],
  callbacks = [],
  cursor = 0,
  refCursor = 0,
  callbackCursor = 0,
  focus,
  previousFocus,
  cleanup;
let lists = [],
  changes = [],
  alerts = [],
  routes = [];
let session = {
  access_token: 'merchant',
  role: 'MERCHANT',
  expiresAt: Date.now() + 60000,
};
const jsx = (type, props) => ({ type, props });
const modules = {
  react: {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (value) => {
          states[i] = typeof value === 'function' ? value(states[i]) : value;
        },
      ];
    },
    useRef: (initial) => {
      const i = refCursor++;
      return refs[i] ?? (refs[i] = { current: initial });
    },
    useCallback: (fn, deps) => {
      const i = callbackCursor++;
      if (
        !callbacks[i] ||
        deps.some((value, index) => value !== callbacks[i].deps[index])
      )
        callbacks[i] = { fn, deps };
      return callbacks[i].fn;
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    ActivityIndicator: 'ActivityIndicator',
    Alert: { alert: (...args) => alerts.push(args) },
    AppState: { addEventListener: () => ({ remove() {} }) },
    Pressable: 'Pressable',
    RefreshControl: 'RefreshControl',
    ScrollView: 'ScrollView',
    StyleSheet: { create: (s) => s },
    Text: 'Text',
    View: 'View',
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: { push: (route) => routes.push(route), back() {} },
    useFocusEffect: (fn) => {
      focus = fn;
    },
  },
  '../ui/PageHeader': { PageHeader: 'PageHeader' },
  '../ui/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  '../ui/BottomNavigation': { BottomNavigation: 'BottomNavigation' },
  '../../services/api/auth': { getAuthSession: () => session },
  '../../services/api/merchantReservations': {
    getMerchantReservations: (options) =>
      new Promise((resolve, reject) =>
        lists.push({ options, resolve, reject }),
      ),
  },
  '../../services/api/reservations': {
    changeReservationStatus: (...args) =>
      new Promise((resolve, reject) => changes.push({ args, resolve, reject })),
  },
  '../../utils/appDiagnostics': { logAppError() {} },
};
const api = {};
new Function('require', 'exports', source)((name) => modules[name], api);
function render() {
  cursor = refCursor = callbackCursor = 0;
  const tree = api.MerchantReservationsScreen({ onTab() {} });
  if (focus !== previousFocus) {
    cleanup?.();
    previousFocus = focus;
    cleanup = focus();
  }
  return tree;
}
const nodes = (tree) =>
  !tree || typeof tree !== 'object'
    ? []
    : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const text = (tree) =>
  typeof tree === 'string' || typeof tree === 'number'
    ? String(tree)
    : !tree || typeof tree !== 'object'
      ? ''
      : [tree.props?.children].flat(Infinity).map(text).join('');
const find = (type, title) =>
  nodes(render()).find(
    (node) => node.type === type && (!title || node.props.title === title),
  );
const tick = () => new Promise((done) => setImmediate(done));
const rows = Array.from({ length: 10 }, (_, i) => ({
  reservation_id: 501 + i,
  customer_id: 12,
  product_id: 3,
  product_name: '상품' + (501 + i),
  quantity: 2,
  unit_price: 2500,
  total_price: 5000,
  pickup_at: '2026-11-10T15:00:00+09:00',
  request_note: i === 0 ? '덜 익은 상품' : null,
  status: ['PENDING', 'CONFIRMED', 'READY'][i] ?? 'COMPLETED',
  created_at: '2026-11-10T10:00:00+09:00',
}));
function card(id) {
  return nodes(render()).find(
    (node) =>
      node.type === 'View' && node.props.accessibilityLabel === `예약 #${id}`,
  );
}
(async () => {
  assert.equal(render().type, 'SafeAreaView');
  assert.deepEqual(lists[0].options, {});
  lists
    .shift()
    .resolve({ reservations: rows, total_count: 11, page: 1, size: 10 });
  await tick();
  let tree = render();
  assert.ok(text(tree).includes('덜 익은 상품'));
  assert.ok(text(tree).includes('5,000원'));
  assert.ok(find('BottomNavigation'));
  find('PrimaryButton', '픽업 QR 스캔').props.onPress();
  assert.deepEqual(routes, ['/pickup-scan']);
  find('PrimaryButton', '더 보기').props.onPress();
  assert.equal(lists[0].options.page, 2);
  lists.shift().resolve({
    reservations: [
      {
        ...rows[0],
        reservation_id: 511,
        product_name: '상품511',
        status: 'COMPLETED',
      },
    ],
    total_count: 11,
    page: 2,
    size: 10,
  });
  await tick();
  assert.ok(text(render()).includes('상품511'));
  const confirmButton = nodes(card(501)).find(
    (node) => node.type === 'PrimaryButton',
  );
  confirmButton.props.onPress();
  assert.equal(changes.length, 0);
  assert.ok(!alerts.at(-1)[1].includes('상품501'));
  assert.ok(!alerts.at(-1)[1].includes('501'));
  const confirm = alerts
    .at(-1)[2]
    .find((button) => button.text === '확인').onPress;
  confirm();
  confirm();
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].args, [501, 'CONFIRMED']);
  changes.shift().resolve({
    reservation_id: 501,
    status: 'CONFIRMED',
    updated_at: '2026-11-10T12:00:00',
    message: '확인',
  });
  await tick();
  render();
  assert.equal(lists.length, 1);
  lists.shift().resolve({
    reservations: rows.map((row) =>
      row.reservation_id === 501 ? { ...row, status: 'CONFIRMED' } : row,
    ),
    total_count: 11,
    page: 1,
    size: 10,
  });
  await tick();
  assert.equal(
    nodes(card(501)).find((node) => node.type === 'PrimaryButton').props.title,
    '픽업 준비 완료',
  );
  nodes(card(501))
    .find((node) => node.type === 'PrimaryButton')
    .props.onPress();
  alerts
    .at(-1)[2]
    .find((button) => button.text === '확인')
    .onPress();
  changes.shift().reject(new Error('상태 변경 거절'));
  await tick();
  assert.ok(text(render()).includes('상태 변경 거절'));
  assert.equal(
    nodes(card(501)).find((node) => node.type === 'PrimaryButton').props.title,
    '픽업 준비 완료',
  );
  const filter = nodes(render()).find(
    (node) => node.type === 'Pressable' && text(node) === '준비 완료',
  );
  filter.props.onPress();
  render();
  assert.deepEqual(lists[0].options, { status: 'READY' });
  lists.shift().reject(new Error('목록 조회 실패'));
  await tick();
  assert.ok(text(render()).includes('목록 조회 실패'));
  find('PrimaryButton', '다시 시도').props.onPress();
  render();
  lists
    .shift()
    .resolve({ reservations: [], total_count: 0, page: 1, size: 10 });
  await tick();
  assert.ok(text(render()).includes('해당 상태의 예약이 없어요.'));
  assert.ok(!text(render()).includes('새로고침'));
  const refreshControl = nodes(render()).find(
    (node) => node.type === 'ScrollView' && node.props.refreshControl,
  ).props.refreshControl;
  refreshControl.props.onRefresh();
  refreshControl.props.onRefresh();
  render();
  assert.equal(
    lists.length,
    1,
    'pull refresh must not create duplicate requests',
  );
  const stale = lists.shift();
  session = { ...session, access_token: 'other-merchant' };
  render();
  stale.resolve({ reservations: rows, total_count: 10, page: 1, size: 10 });
  await tick();
  assert.ok(!text(render()).includes('상품501'));
  lists
    .shift()
    .resolve({ reservations: [], total_count: 0, page: 1, size: 10 });
  await tick();
  session = { ...session, role: 'CUSTOMER' };
  render();
  assert.ok(!text(render()).includes('상품501'));
  assert.ok(text(render()).includes('상인 계정'));
  console.log(
    'PASS: merchant list safe areas, notes/price/state actions, pagination, server-confirmed status update with duplicate lock, filters/retry/centered empty, QR scan route and customer gate',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
