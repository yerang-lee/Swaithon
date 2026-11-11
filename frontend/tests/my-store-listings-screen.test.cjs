const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/my-store.tsx'), 'utf8'),
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
    ScrollView: 'ScrollView',
    StyleSheet: { create: (s) => s },
    Text: 'Text',
    View: 'View',
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: {
      push: (route) => routes.push(route),
      replace: (route) => routes.push(route),
      back() {},
    },
    useFocusEffect: (fn) => {
      focus = fn;
    },
  },
  '../components/ui/PageHeader': { PageHeader: 'PageHeader' },
  '../components/ui/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  '../services/catalogChanges': { useCatalogRevision: () => 0 },
  '../components/ui/BottomNavigation': { BottomNavigation: 'BottomNavigation' },
  '../services/api/auth': { getAuthSession: () => session },
  '../services/api/myStoreListings': {
    getMyStoreListings: (options) =>
      new Promise((resolve, reject) =>
        lists.push({ options, resolve, reject }),
      ),
  },
  '../../services/api/reservations': {
    changeReservationStatus: (...args) =>
      new Promise((resolve, reject) => changes.push({ args, resolve, reject })),
  },
  '../utils/appDiagnostics': { logAppError() {} },
};
const api = {};
new Function('require', 'exports', source)((name) => modules[name], api);
function render() {
  cursor = refCursor = callbackCursor = 0;
  const tree = api.default();
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
  listing_id: i + 1,
  product_id: i + 1,
  product_name: '상품' + (i + 1),
  category_id: null,
  price: 5000,
  sale_price: i === 0 ? 4000 : null,
  sale_quantity: 1,
  sale_unit: '봉지',
  stock_quantity: 10,
  is_sold_out: i === 1,
  sale_rate: i === 0 ? 20 : null,
  created_at: '2026-11-10T10:00:00+09:00',
}));
(async () => {
  assert.equal(render().type, 'SafeAreaView');
  lists.shift().resolve({ listings: rows, total_count: 11, page: 1, size: 10 });
  await tick();
  let tree = render();
  assert.ok(text(tree).includes('상품1'));
  assert.ok(text(tree).includes('4,000원'));
  assert.ok(text(tree).includes('품절'));
  assert.equal(
    nodes(tree).some((node) =>
      node.props?.accessibilityLabel?.includes('관심'),
    ),
    false,
  );
  nodes(tree)
    .find((node) => node.props?.accessibilityLabel === '상품1 상품 상세')
    .props.onPress();
  assert.deepEqual(routes.pop(), {
    pathname: '/products/[listingId]',
    params: { listingId: '1' },
  });
  const more = nodes(render()).find(
    (node) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === '더 보기',
  );
  more.props.onPress();
  more.props.onPress();
  assert.equal(lists.length, 1);
  assert.deepEqual(lists[0].options, { page: 2 });
  lists.shift().resolve({
    listings: [{ ...rows[0], listing_id: 11, product_name: '마지막 상품' }],
    total_count: 11,
    page: 2,
    size: 10,
  });
  await tick();
  assert.ok(text(render()).includes('마지막 상품'));
  assert.equal(
    nodes(render()).find(
      (node) =>
        node.type === 'Pressable' &&
        node.props.accessibilityLabel === '더 보기',
    ),
    undefined,
  );
  cleanup();
  previousFocus = undefined;
  render();
  lists.shift().resolve({ listings: [], total_count: 0, page: 1, size: 10 });
  await tick();
  assert.ok(text(render()).includes('등록한 상품이 없어요.'));
  cleanup();
  previousFocus = undefined;
  render();
  const old = lists.shift();
  session = { ...session, access_token: 'another' };
  render();
  old.resolve({ listings: rows, total_count: 10, page: 1, size: 10 });
  await tick();
  assert.ok(!text(render()).includes('상품1'));
  lists.shift().reject(new Error('서버 연결 실패'));
  await tick();
  assert.ok(text(render()).includes('서버 연결 실패'));
  find('PrimaryButton', '다시 시도').props.onPress();
  render();
  assert.equal(lists.length, 1);
  cleanup();
  console.log(
    'PASS: my store safe area, own product cards without hearts, detail route, locked pagination, focus refresh, centered empty/retry and stale account isolation',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
