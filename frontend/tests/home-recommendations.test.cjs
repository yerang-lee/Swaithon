const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
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
const helpers = {};
new Function('exports', compile('src/utils/marketDistance.ts'))(helpers);
const jsx = (type, props, key) => ({ type, props, key });
let slots = {
    4: { latitude: 37.5, longitude: 127, name: '선택위치', radius: 3 },
    6: [{ market_id: 3, market_name: '확인된시장' }],
  },
  cursor = 0,
  focus = [],
  requests = [],
  routes = [],
  hearts = [],
  session = {
    access_token: 'current-user',
    expiresAt: Date.now() + 60000,
    role: 'CUSTOMER',
  };
const react = {
  useState: (initial) => {
    const i = cursor++;
    if (!(i in slots))
      slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[i],
      (value) => {
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      },
    ];
  },
  useEffect() {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
};
const modules = {
  '../hooks/useRecommendationTracking': {
    useRecommendationImpressions: () => ({
      carouselRef: { current: null },
      cardRef: () => () => {},
      checkVisibility() {},
    }),
  },
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    StyleSheet: { create: (s) => s },
    useWindowDimensions: () => ({ width: 390 }),
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: { push: (route) => routes.push(route) },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (fn) => focus.push(fn),
  },
  '../services/api/auth': { getAuthSession: () => session },
  '../services/locationChanges': { useLocationRevision: () => 0 },
  '../utils/marketDistance': helpers,
  '../hooks/useFavorites': {
    useFavorites: () => ({
      favorites: [],
      pendingFavorites: ['1002'],
      toggleFavorite: (...args) => hearts.push(args),
    }),
  },
  '../services/explorationLocation': {
    readLocation: async () => ({
      latitude: 37.5,
      longitude: 127,
      name: '선택위치',
      radius: 3,
    }),
  },
  '../services/api/recommendations': {
    getRecommendations: (options) =>
      new Promise((resolve, reject) =>
        requests.push({ resolve, reject, options }),
      ),
  },
  '../constants/theme': {
    theme: { colors: { primary: '#53B175', text: '#181725' }, radii: {} },
  },
  '../utils/appDiagnostics': { logAppError() {} },
};
const api = {};
new Function('require', 'exports', compile('src/app/home.tsx'))(
  (name) => modules[name] ?? {},
  api,
);
function render() {
  cursor = 0;
  focus = [];
  return api.default();
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
const result = {
  request_id: 'rec_home',
  items: [
    {
      listing_id: 'listing_101',
      name: '추천사과',
      store_name: '과일가게',
      market_id: 'market_3',
      price: 10000,
      distance_km: 0.5,
    },
    {
      listing_id: '1002',
      name: '추천배',
      store_name: '배가게',
      market_id: '3',
      price: 8000,
      distance_km: 0.7,
    },
  ],
};
(async () => {
  render();
  focus.forEach((fn) => fn());
  await tick();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].options, { latitude: 37.5, longitude: 127 });
  requests.shift().resolve(result);
  await tick();
  let tree = render();
  assert.ok(text(tree).includes('추천사과'));
  assert.ok(text(tree).includes('10,000원'));
  assert.ok(text(tree).includes('배가게 · 확인된시장 · 0.7km'));
  assert.ok(!text(tree).includes('과일가게 · 확인된시장'));
  assert.ok(!text(tree).includes('화면 확인용 예시'));
  walk(tree)
    .find((n) => n.props?.accessibilityLabel === '추천사과 상세')
    .props.onPress();
  assert.deepEqual(routes.at(-1), {
    pathname: '/products/[listingId]',
    params: {
      listingId: 'listing_101',
      requestId: 'rec_home',
      marketDistanceMeters: '500',
    },
  });
  walk(tree)
    .find((n) => n.props?.accessibilityLabel === '추천사과 찜 추가')
    .props.onPress();
  assert.deepEqual(hearts[0], ['listing_101', { requestId: 'rec_home' }]);
  assert.equal(
    walk(tree).find((n) => n.props?.accessibilityLabel === '추천배 찜 추가')
      .props.disabled,
    true,
  );
  // A request from a previous visit must never populate the next screen.
  const cleanups = focus.map((fn) => fn());
  await tick();
  const stale = requests.shift();
  cleanups.forEach((fn) => fn?.());
  stale.resolve({
    ...result,
    items: [{ ...result.items[0], name: '이전추천' }],
  });
  await tick();
  assert.ok(!text(render()).includes('이전추천'));
  focus.forEach((fn) => fn());
  await tick();
  requests.shift().reject(new Error('추천 서버 오류'));
  await tick();
  tree = render();
  assert.ok(text(tree).includes('추천 서버 오류'));
  assert.ok(text(tree).includes('다시 시도'));
  assert.ok(!text(tree).includes('추천사과'));
  focus.forEach((fn) => fn());
  await tick();
  requests.shift().resolve({ request_id: 'empty', items: [] });
  await tick();
  assert.ok(text(render()).includes('추천 상품이 없어요.'));
  slots[4] = null;
  render();
  focus[1]();
  await tick();
  assert.equal(requests.length, 0);
  assert.ok(text(render()).includes('위치를 설정하면'));
  slots[4] = { latitude: 35.1, longitude: 129.1, name: '새 위치', radius: 3 };
  render();
  focus[1]();
  await tick();
  assert.deepEqual(requests[0].options, { latitude: 35.1, longitude: 129.1 });
  requests.shift().resolve({ request_id: 'new-location', items: [] });
  await tick();
  console.log(
    'PASS: home server recommendations, exact market-name matching, request ID detail/favorite propagation, pending hearts, stale responses and error/empty states',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
