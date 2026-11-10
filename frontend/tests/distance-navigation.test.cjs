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
const helpers = {};
new Function('exports', compile('src/utils/marketDistance.ts'))(helpers);
const element = (type, props, key) => ({ type, props, key });
const product = {
  listing_id: 101,
  product_id: 1,
  store_id: 1,
  market_id: 5,
  store_name: '테스트가게',
  market_name: '테스트시장',
  category_id: null,
  product_name: '사과',
  price: 5000,
  sale_price: null,
  is_on_sale: false,
  is_sold_out: false,
  image_url: null,
  description: null,
};
const store = {
  store_id: 1,
  market_id: 5,
  store_name: '테스트가게',
  address: '테스트시장내부',
  image_url: null,
  category: null,
};
let session = null;
const trackedViews = [];
function render(file, slots, params) {
  let cursor = 0;
  const routes = [];
  const modules = {
    '../../hooks/useRecommendationTracking': {
      useRecommendationView: (options) => trackedViews.push(options),
    },
    react: {
      useState: (initial) => [
        cursor in slots ? slots[cursor++] : (cursor++, initial),
        () => {},
      ],
      useRef: (value) => ({ current: value }),
      useEffect() {},
      useCallback: (fn) => fn,
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': {
      View: 'View',
      Text: 'Text',
      Pressable: 'Pressable',
      StyleSheet: { create: (s) => s },
      Alert: { alert() {} },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': {
      router: { push: (route) => routes.push(route) },
      useLocalSearchParams: () => params,
    },
    '../../utils/marketDistance': helpers,
    '../../hooks/useMarketDistance': { useMarketDistance: () => 350 },
    '../../services/catalogChanges': { useCatalogRevision: () => 0 },
    '../../hooks/useFavorites': {
      useFavorites: () => ({
        favorites: [],
        pendingFavorites: [],
        toggleFavorite() {},
      }),
    },
    '../../services/api/auth': { getAuthSession: () => session },
    '../../services/devMock': { isMockMode: () => false },
    '../../constants/theme': { theme: { colors: { primary: '#53B175' } } },
    '../../constants/productCategories': { productCategories: [] },
    '../../data/demoProducts': { demoProducts: [] },
  };
  const api = {};
  new Function('require', 'exports', compile(file))(
    (name) => modules[name] ?? {},
    api,
  );
  return { tree: api.default(), routes };
}
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
}
function text(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return [node.props?.children].flat(Infinity).map(text).join('');
}
let view = render(
  'src/app/markets/[marketId].tsx',
  { 0: 'stores', 6: [store], 7: [], 10: false },
  { marketId: '5', marketName: '시장', marketDistanceMeters: '350' },
);
walk(view.tree)
  .find(
    (node) =>
      node.type === 'Pressable' &&
      node.props.accessibilityRole === 'button' &&
      text(node).includes('테스트가게'),
  )
  .props.onPress();
assert.equal(text(view.tree).includes('테스트시장내부'), false);
assert.equal(view.routes[0].pathname, '/stores/[storeId]');
assert.equal(view.routes[0].params.marketDistanceMeters, '350');
view = render(
  'src/app/markets/[marketId].tsx',
  { 0: 'products', 6: [], 7: [product], 10: false },
  { marketId: '5', marketDistanceMeters: '350' },
);
assert.equal(text(view.tree).includes('0.3km'), false);
assert.ok(text(view.tree).includes('테스트가게'));
const filters = walk(view.tree).filter(
  (node) => node.props?.accessibilityRole === 'checkbox',
);
assert.equal(filters.length, 2);
assert.ok(
  filters.every((node) =>
    walk(node).some((child) => child.props?.name === 'check-box-outline-blank'),
  ),
);
walk(view.tree)
  .find((node) => node.props?.accessibilityLabel === '사과 상세')
  .props.onPress();
assert.equal(view.routes[0].params.marketDistanceMeters, '350');
view = render(
  'src/app/stores/[storeId].tsx',
  { 0: store, 1: [product], 4: false },
  { storeId: '1', marketDistanceMeters: '350' },
);
walk(view.tree)
  .find((node) => node.props?.accessibilityLabel === '사과 상세')
  .props.onPress();
assert.equal(view.routes[0].params.marketDistanceMeters, '350');
assert.ok(text(view.tree).includes('0.3km'));
view = render(
  'src/app/products/[listingId].tsx',
  { 0: product, 1: false },
  { listingId: '101', marketDistanceMeters: '350', requestId: 'rec_test' },
);
walk(view.tree)
  .find(
    (node) =>
      node.type === 'Pressable' &&
      node.props.accessibilityRole === 'button' &&
      text(node).includes('테스트가게'),
  )
  .props.onPress();
assert.equal(view.routes[0].pathname, '/stores/[storeId]');
assert.equal(view.routes[0].params.marketDistanceMeters, '350');
assert.ok(text(view.tree).includes('0.3km'));
assert.equal(text(view.tree).includes('시장까지'), false);
assert.ok(text(view.tree).includes('테스트시장 · 0.3km'));
assert.deepEqual(trackedViews.at(-1), {
  requestId: 'rec_test',
  listingId: '101',
  ready: true,
});
for (const [salePrice, label] of [
  [4500, '4,500원'],
  [0, '0원'],
  [null, '5,000원'],
]) {
  const priceView = render(
    'src/app/products/[listingId].tsx',
    { 0: { ...product, sale_price: salePrice }, 1: false },
    { listingId: '101' },
  );
  assert.ok(text(priceView.tree).includes(label));
}
render(
  'src/app/products/[listingId].tsx',
  { 0: null, 1: false },
  { listingId: '101', requestId: 'rec_test' },
);
assert.equal(trackedViews.at(-1).ready, false);
console.log(
  'PASS: market-to-store, market-to-product, store-to-product and product-to-store preserve distance; details display distance without prefix',
);

// The same store screen hides customer controls only for its actual owner.
for (const [role, storeId, hidden] of [
  ['MERCHANT', 1, true],
  ['MERCHANT', 2, false],
  ['CUSTOMER', 1, false],
]) {
  session = { role, storeId, access_token: 'current-account' };
  const ownerView = render(
    'src/app/stores/[storeId].tsx',
    { 0: store, 1: [product], 4: false },
    { storeId: '1', marketDistanceMeters: '350' },
  );
  assert.equal(text(ownerView.tree).includes('0.3km'), !hidden);
  assert.equal(
    walk(ownerView.tree).some(
      (node) => node.props?.accessibilityLabel === '사과 관심 추가',
    ),
    !hidden,
  );
}
console.log(
  'PASS: own store hides hearts and distance; other stores and customer views retain both',
);
