const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(
      __dirname,
      '../src/components/reservations/ReservationsScreen.tsx',
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
const jsx = (type, props, key) => ({ type, props, key });
let states = [],
  refs = [],
  callbacks = [],
  effects = [],
  stateCursor = 0,
  refCursor = 0,
  callbackCursor = 0,
  effectCursor = 0,
  pending = [],
  focus,
  previousFocus,
  focusCleanup,
  listeners = new Set(),
  session = { access_token: 'customer' },
  lists = [],
  details = [],
  cancels = [];
const react = {
  useState: (initial) => {
    const i = stateCursor++;
    if (!(i in states)) states[i] = initial;
    return [
      states[i],
      (value) => {
        states[i] = typeof value === 'function' ? value(states[i]) : value;
      },
    ];
  },
  useRef: (value) => {
    const i = refCursor++;
    return (refs[i] ??= { current: value });
  },
  useCallback: (fn, deps) => {
    const i = callbackCursor++;
    if (
      !callbacks[i] ||
      deps.some((value, index) => value !== callbacks[i].deps[index])
    )
      callbacks[i] = { deps, fn };
    return callbacks[i].fn;
  },
  useEffect: (fn, deps) => {
    const i = effectCursor++;
    if (
      !effects[i] ||
      deps.some((value, index) => value !== effects[i].deps[index])
    ) {
      effects[i]?.cleanup?.();
      effects[i] = { deps };
      pending.push(() => (effects[i].cleanup = fn()));
    }
  },
};
const modules = {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    StyleSheet: { create: (s) => s },
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    Modal: 'Modal',
    AppState: {
      addEventListener: (_, fn) => {
        listeners.add(fn);
        return { remove: () => listeners.delete(fn) };
      },
    },
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: { push() {} },
    useFocusEffect: (fn) => (focus = fn),
  },
  '../../services/api/auth': { getAuthSession: () => session },
  '../../services/api/reservations': {
    getReservations: (page, status) =>
      new Promise((resolve, reject) =>
        lists.push({ page, status, resolve, reject }),
      ),
    getReservationDetail: (id) =>
      new Promise((resolve, reject) => details.push({ id, resolve, reject })),
    cancelReservation: (id) =>
      new Promise((resolve) => cancels.push({ id, resolve })),
  },
  '../../services/devMock': { isMockMode: () => true },
  '../../utils/appDiagnostics': { logAppError() {} },
  '../ui/PageHeader': { PageHeader: 'PageHeader' },
  '../ui/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  './ReservationPickupQr': { ReservationPickupQr: 'ReservationPickupQr' },
};
const api = {};
const timers = new Set();
new Function('require', 'exports', 'setInterval', 'clearInterval', source)(
  (name) => modules[name] ?? {},
  api,
  (fn) => {
    timers.add(fn);
    return fn;
  },
  (fn) => timers.delete(fn),
);
function render() {
  stateCursor = refCursor = callbackCursor = effectCursor = 0;
  pending = [];
  const tree = api.ReservationsScreen({ onTab() {} });
  pending.forEach((fn) => fn());
  if (focus !== previousFocus) {
    focusCleanup?.();
    previousFocus = focus;
    focusCleanup = focus();
  }
  return tree;
}
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
const tick = () => new Promise((resolve) => setImmediate(resolve));
const item = {
  reservation_id: 501,
  product_id: 1,
  product_name: '목록 사과',
  store_id: 1,
  store_name: '과일가게',
  market_id: 1,
  market_name: '시장',
  quantity: 1,
  unit_price: 5000,
  total_price: 5000,
  pickup_at: '2026-11-03T14:30:00',
  status: 'CONFIRMED',
  created_at: '2026-11-03T13:00:00+09:00',
};
const response = {
  reservation_id: 501,
  listing_id: 101,
  product_id: 1,
  product_name: '상세 사과',
  store_id: 1,
  store_name: '과일가게',
  quantity: 2,
  total_price: 10000,
  status: 'READY',
  created_at: item.created_at,
  qr_code_data: 'TEST_ONLY_PARENT',
  qr_code_expires_at: '2099-11-04T14:30:00+09:00',
};
const panel = (tree) =>
  walk(tree).find((node) => node.type === 'ReservationPickupQr')?.props;
(async () => {
  render();
  lists.shift().resolve({ reservations: [item], total_count: 1 });
  await tick();
  let tree = render();
  assert.ok(text(tree).includes('픽업 예정'));
  walk(tree)
    .find(
      (node) =>
        node.props?.accessibilityLabel === '과일가게 목록 사과 예약 상세',
    )
    .props.onPress();
  render();
  assert.equal(details[0].id, 501);
  tree = render();
  assert.equal(panel(tree).loading, true);
  details.shift().resolve(response);
  await tick();
  tree = render();
  assert.equal(panel(tree).detail.qr_code_data, response.qr_code_data);
  assert.equal(panel(tree).detail.status, 'READY');
  assert.equal(panel(tree).testMode, true);
  assert.ok(text(tree).includes('상세 사과'));
  assert.ok(text(tree).includes('10,000원'));
  timers.forEach((fn) => fn());
  assert.equal(details.length, 1);
  assert.equal(panel(render()).loading, false);
  timers.forEach((fn) => fn());
  assert.equal(details.length, 1, 'polls must not overlap');
  details
    .shift()
    .resolve({
      ...response,
      status: 'COMPLETED',
      qr_code_data: null,
      qr_code_expires_at: null,
    });
  await tick();
  tree = render();
  assert.ok(text(tree).includes('픽업이 완료됐습니다'));
  assert.equal(panel(tree), undefined, 'completed pickup must hide QR');
  assert.ok(
    walk(tree).some(
      (node) =>
        node.type === 'PrimaryButton' && node.props.title === '예약 목록으로',
    ),
  );
  timers.forEach((fn) => fn());
  assert.equal(details.length, 0, 'completed pickup stops polling');
  listeners.forEach((fn) => fn('background'));
  timers.forEach((fn) => fn());
  assert.equal(details.length, 0);
  listeners.forEach((fn) => fn('active'));
  details.shift().resolve(response);
  await tick();
  tree = render();
  walk(tree)
    .find((node) => node.type === 'Pressable' && text(node) === '예약 취소하기')
    .props.onPress();
  tree = render();
  assert.equal(
    walk(tree).find((node) => node.type === 'Modal').props.visible,
    true,
  );
  listeners.forEach((fn) => fn('background'));
  tree = render();
  assert.equal(panel(tree).detail, null);
  listeners.forEach((fn) => fn('active'));
  const stale = details.shift();
  assert.equal(stale.id, 501);
  walk(render())
    .find(
      (node) =>
        node.type === 'PrimaryButton' && node.props.title === '예약 취소',
    )
    .props.onPress();
  assert.equal(cancels[0].id, 501);
  assert.equal(panel(render()).disabled, true);
  cancels.shift().resolve();
  await tick();
  tree = render();
  assert.equal(panel(tree).status, 'CANCELLED');
  assert.equal(panel(tree).detail, null);
  stale.resolve(response);
  await tick();
  assert.equal(panel(render()).detail, null);
  panel(render()).onRefresh();
  render();
  details.shift().resolve({
    ...response,
    status: 'CANCELLED',
    qr_code_data: null,
    qr_code_expires_at: null,
  });
  await tick();
  assert.equal(panel(render()).detail.qr_code_data, null);
  session = { access_token: 'different' };
  tree = render();
  assert.equal(panel(tree), undefined);
  tree = render();
  assert.ok(!text(tree).includes('상세 사과'));
  assert.ok(!text(tree).includes('목록 사과'));
  focusCleanup?.();
  effects.forEach((effect) => effect.cleanup?.());
  console.log(
    'PASS: detail GET on selection, authoritative summary, READY test QR, background clearing/resume refresh, cancellation invalidates stale QR responses, and account isolation',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
