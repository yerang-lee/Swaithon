const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/home.tsx'), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const distanceHelpers = {};
new Function(
  'exports',
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, '../src/utils/marketDistance.ts'),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
)(distanceHelpers);
let slots = [],
  refs = [],
  stateCursor = 0,
  refCursor = 0,
  effectCursor = 0,
  effects = [],
  scheduled = [],
  focus = [],
  routes = [],
  alerts = [],
  marketRequests = [],
  storeRequests = [];
let saved = {
  latitude: 37.55,
  longitude: 126.91,
  radius: 3,
  name: '저장 위치',
};
const jsx = (type, props, key) => ({ type, props, key });
const react = {
  useState(initial) {
    const i = stateCursor++;
    if (!(i in slots)) slots[i] = initial;
    return [
      slots[i],
      (value) => {
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      },
    ];
  },
  useRef(initial) {
    const i = refCursor++;
    refs[i] ??= { current: initial };
    return refs[i];
  },
  useCallback: (fn) => fn,
  useEffect(fn, deps) {
    const i = effectCursor++;
    const previous = effects[i];
    if (!previous || deps.some((value, j) => value !== previous.deps[j])) {
      previous?.cleanup?.();
      effects[i] = { deps };
      scheduled.push(() => {
        effects[i].cleanup = fn();
      });
    }
  },
};
const locationApi = {
  readLocation: async () => saved,
  getCurrentLocation: async () => {
    throw new Error('saved location should be used');
  },
  saveLocation: async () => {
    throw new Error('selection must not save location');
  },
};
const modules = {
  '../services/locationChanges': { useLocationRevision: () => 0 },
  '../utils/marketDistance': distanceHelpers,
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    StyleSheet: { create: (s) => s },
    useWindowDimensions: () => ({ width: 390 }),
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    Alert: { alert: (...args) => alerts.push(args) },
  },
  'expo-router': {
    router: { push: (route) => routes.push(route) },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (fn) => focus.push(fn),
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '../hooks/useFavorites': {
    useFavorites: () => ({
      favorites: [],
      favoriteItems: [],
      pendingFavorites: [],
      toggleFavorite() {},
    }),
  },
  '../data/demoProducts': { demoProducts: [] },
  '../constants/theme': {
    theme: {
      colors: { primary: '#53B175', text: '#000', border: '#DDD' },
      radii: {},
    },
  },
  '../services/api/auth': { getAuthSession: () => null },
  '../services/explorationLocation': locationApi,
  '../services/api/markets': {
    getNearbyMarkets: (location) =>
      new Promise((resolve) => marketRequests.push({ location, resolve })),
  },
  '../services/api/nearbyStores': {
    getStoresForNearbyMarkets: async (markets, isActive) => {
      storeRequests.push({ markets, isActive });
      return {
        stores: [
          {
            store_id: 9,
            store_name: '실제 가게',
            market_name: markets[0].market_name,
            market_distance: markets[0].distance,
            address: '테스트시장내부',
            image_url: null,
          },
        ],
        failedMarketCount: 0,
      };
    },
  },
  '../utils/appDiagnostics': { logAppError() {} },
};
const api = {};
new Function('require', 'exports', source)((name) => modules[name] ?? {}, api);
function render() {
  stateCursor = refCursor = effectCursor = 0;
  focus = [];
  const tree = api.default();
  for (const task of scheduled.splice(0)) task();
  return tree;
}
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  render();
  const firstFocus = focus.map((callback) => callback());
  await tick();
  render();
  assert.equal(marketRequests.length, 1);
  assert.deepEqual(marketRequests[0].location, saved);
  const stale = marketRequests[0];
  firstFocus.forEach((cleanup) => cleanup?.());
  saved = { latitude: 37.6, longitude: 127, radius: 1, name: '새 위치' };
  focus.forEach((callback) => callback());
  await tick();
  render();
  assert.equal(marketRequests.length, 2);
  const registered = {
    market_id: 5,
    market_name: '새 주변 시장',
    address: '시장 주소',
    distance: 250,
    image_url: null,
  };
  const unregistered = {
    market_id: null,
    market_name: '미등록시장',
    distance: 500,
    image_url: null,
  };
  marketRequests[1].resolve([registered, unregistered]);
  await tick();
  let tree = render();
  assert.equal(storeRequests.length, 1);
  assert.equal(storeRequests[0].isActive(), true);
  stale.resolve([{ ...registered, market_name: '과거 시장' }]);
  await tick();
  tree = render();
  assert.equal(storeRequests.length, 1);
  const sections = walk(tree).filter(
    (node) => node.type?.name === 'PlaceSection',
  );
  assert.equal(sections.length, 2);
  const markets = sections.find(
    (node) => node.props.title === '내 주변 시장',
  ).props;
  const stores = sections.find(
    (node) => node.props.title === '내 주변 가게',
  ).props;
  assert.deepEqual(
    markets.items.map((item) => item.name),
    ['새 주변 시장', '미등록시장'],
  );
  assert.equal(stores.items[0].name, '실제 가게');
  assert.equal(stores.items[0].description, '새 주변 시장');
  assert.equal(markets.items[0].description, '');
  assert.ok(!stores.items[0].description.includes('테스트시장내부'));
  assert.equal(markets.items[0].distanceLabel, '0.3km');
  assert.equal(stores.items[0].distanceLabel, '0.3km');
  markets.items[0].onPress();
  assert.deepEqual(routes.at(-1), {
    pathname: '/markets/[marketId]',
    params: {
      marketId: '5',
      marketName: '새 주변 시장',
      marketDistanceMeters: '250',
    },
  });
  markets.items[1].onPress();
  assert.equal(routes.length, 1);
  assert.equal(alerts.length, 1);
  stores.items[0].onPress();
  assert.deepEqual(routes.at(-1), {
    pathname: '/stores/[storeId]',
    params: {
      storeId: '9',
      storeName: '실제 가게',
      address: '테스트시장내부',
      marketDistanceMeters: '250',
    },
  });
  assert.equal('preview' in routes.at(-1).params, false);
  console.log(
    'PASS: home uses saved location/radius and shared market/store loaders, stale responses ignored, real-ID routes without preview, unregistered guidance, store uses parent-market distance with explicit label',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
