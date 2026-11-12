const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');

function mount(file, dependencies) {
  const states = [], effects = [], scheduled = [];
  let stateIndex = 0, effectIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const common = {
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useEffect(fn) {
        const index = effectIndex++;
        if (!effects[index]) { effects[index] = true; scheduled.push(fn); }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ...Object.fromEntries(['View', 'Text', 'Image', 'Pressable', 'ScrollView', 'ActivityIndicator'].map(n => [n, n])), StyleSheet: { create: v => v } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-svg': { default: 'Svg', Circle: 'Circle', Line: 'Line', Path: 'Path', Text: 'SvgText' },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => common[name] ?? dependencies[name] ?? {}, exports);
  return async function render(component, props) {
    function draw() {
      stateIndex = effectIndex = 0;
      const tree = exports[component](props);
      while (scheduled.length) scheduled.shift()();
      return tree;
    }
    draw();
    await new Promise(resolve => setImmediate(resolve));
    return draw();
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (tree && typeof tree === 'object') return text(tree.props?.children);
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
}
(async () => {
  const errors = [];
  const renderStore = mount('app/stores/[storeId].tsx', {
    'expo-router': { router: {}, useLocalSearchParams: () => ({ storeId: '9' }) },
    '../../services/catalogChanges': { useCatalogRevision: () => 0 },
    '../../services/devMock': { isMockMode: () => false },
    '../../services/api/auth': { getAuthSession: () => null },
    '../../hooks/useMarketDistance': { useMarketDistance: () => null },
    '../../utils/marketDistance': { marketDistanceParams: () => ({}) },
    '../../hooks/useFavorites': { useFavorites: () => ({ favorites: [], pendingFavorites: [] }) },
    '../../utils/appDiagnostics': { logAppError: (...args) => errors.push(args) },
    '../../services/api/stores': {
      getStore: async () => ({ store_name: '테스트 가게', market_name: '테스트 시장', address: null,
        description: '신선한 상품을 판매해요', phone: '02-000-0000', category: '과일', image_url: null }),
      getStoreProducts: async () => { throw new Error('products unavailable'); },
    },
  });
  const store = await renderStore('default');
  assert.ok(text(store).includes('테스트 가게'));
  assert.ok(text(store).includes('신선한 상품을 판매해요'));
  assert.ok(text(store).includes('02-000-0000'));
  assert.ok(text(store).includes('상품 목록을 불러오지 못했어요.'));
  assert.equal(errors.length, 1);
  assert.deepEqual(store.props.edges, ['top', 'bottom']);
  assert.ok(nodes(store).some(n => n.type === 'ScrollView'));

  const renderChart = mount('components/products/PriceHistoryChart.tsx', {
    '../../services/api/priceHistory': { getPriceHistory: async () => ({ current_price: 10000,
      price_history: [{ price: 10000, recorded_at: '2026-11-11T00:00:00Z' },
        { price: 9000, recorded_at: '2026-11-12T00:00:00Z' }] }) },
    '../../utils/appDiagnostics': { logAppError() {} },
  });
  const chart = await renderChart('PriceHistoryChart', { listingId: '1' });
  assert.ok(text(chart).includes('가격 (단위: 원)'));
  assert.ok(text(chart).includes('날짜 (월/일)'));
  const labels = nodes(chart).filter(n => n.type === 'SvgText');
  assert.equal(labels.filter(n => String(n.props.children).endsWith('원')).length, 3);
  console.log('PASS: store information survives product errors, nullable address, safe area and scroll preserved; chart price/date units visible');
})().catch(error => { console.error(error); process.exitCode = 1; });
