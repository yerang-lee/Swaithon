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
const product = {
  listing_id: 101,
  product_name: '사과',
  store_name: '과일가게',
  market_name: '망원시장',
  market_distance: 300,
  price: 10000,
  sale_price: 8000,
  image_url: null,
};
const location = { name: '청파동', radius: 3, latitude: 37.5, longitude: 127 };
let slots = { 0: location, 4: [product], 5: false };
let cursor = 0,
  routes = [],
  toggles = [],
  saves = [],
  afterFour = true;
const modules = {
  react: {
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value) => {
          slots[index] = value;
        },
      ];
    },
    useEffect() {},
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    TextInput: 'TextInput',
    Modal: 'Modal',
    StyleSheet: { create: (s) => s },
    useWindowDimensions: () => ({ width: 390 }),
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: {
      push: (route) => routes.push(route),
      replace: (route) => routes.push(route),
    },
    useFocusEffect() {},
  },
  '../services/locationChanges': { useLocationRevision: () => 0 },
  '../services/catalogChanges': { useCatalogRevision: () => 0 },
  '../services/api/closingSale': { isClosingSaleTime: () => afterFour },
  '../services/explorationLocation': {
    saveLocation: async (value) => saves.push(value),
  },
  '../utils/marketDistance': helpers,
  '../hooks/useFavorites': {
    useFavorites: () => ({
      favorites: [],
      pendingFavorites: [],
      toggleFavorite: (id) => toggles.push(id),
    }),
  },
  '../components/maps/LocationSettings': {
    LocationSettings: 'LocationSettings',
  },
  '../components/ui/PageHeader': { PageHeader: 'PageHeader' },
  '../components/ui/BottomNavigation': { BottomNavigation: 'BottomNavigation' },
};
const api = {};
new Function('require', 'exports', compile('src/app/closing-sale.tsx'))(
  (name) => modules[name] ?? {},
  api,
);
function render() {
  cursor = 0;
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
(async () => {
  let tree = render();
  assert.equal(
    walk(tree).find((n) => n.type === 'PageHeader').props.title,
    '마감 세일',
  );
  assert.ok(text(tree).includes('과일가게 · 망원시장 · 0.3km'));
  assert.ok(text(tree).includes('8,000원'));
  walk(tree)
    .find((n) => n.props?.accessibilityLabel === '사과 상세')
    .props.onPress();
  assert.deepEqual(routes[0], {
    pathname: '/products/[listingId]',
    params: { listingId: '101', marketDistanceMeters: '300' },
  });
  walk(tree)
    .find((n) => n.props?.accessibilityLabel === '사과 관심 추가')
    .props.onPress();
  assert.deepEqual(toggles, ['101']);
  walk(tree)
    .find((n) => n.props?.accessibilityLabel === '위치 및 검색 반경 설정')
    .props.onPress();
  tree = render();
  assert.equal(walk(tree).find((n) => n.type === 'Modal').props.visible, true);
  const settings = walk(tree).find((n) => n.type === 'LocationSettings');
  assert.deepEqual(settings.props.initial, location);
  settings.props.onApply({ ...location, radius: 5 });
  await new Promise((resolve) => setImmediate(resolve));
  tree = render();
  assert.equal(saves[0].radius, 5);
  assert.equal(walk(tree).find((n) => n.type === 'Modal').props.visible, false);
  walk(tree)
    .find((n) => n.type === 'TextInput')
    .props.onChangeText('없는상품');
  assert.ok(text(render()).includes('검색된 마감 세일 상품이 없어요.'));
  afterFour = false;
  slots[4] = [];
  slots[3] = '';
  assert.ok(
    text(render()).includes('마감 세일은 오후 4시부터 확인할 수 있어요.'),
  );
  console.log(
    'PASS: closing sale header/cards/search, real listing detail navigation, favorite API hook, shared map settings/save and before-16:00 notice',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
