const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/markets.tsx'), 'utf8'),
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
const markets = [
  { market_id: null, market_name: '미등록 A', distance: 100, image_url: null },
  { market_id: null, market_name: '미등록 B', distance: 200, image_url: null },
  { market_id: 7, market_name: '등록 시장', distance: 300, image_url: null },
];
const state = { 2: false, 5: markets };
let cursor = 0;
const routes = [],
  alerts = [];
const element = (type, props, key) => ({ type, props, key });
const modules = {
  '../utils/marketDistance': distanceHelpers,
  react: {
    useState(initial) {
      const slot = cursor++;
      return [slot in state ? state[slot] : initial, () => {}];
    },
    useEffect() {},
    useRef: (value) => ({ current: value }),
  },
  'react/jsx-runtime': { jsx: element, jsxs: element },
  'react-native': {
    Pressable: 'Pressable',
    View: 'View',
    Text: 'Text',
    StyleSheet: { create: (x) => x },
    Alert: { alert: (...args) => alerts.push(args) },
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: { push: (route) => routes.push(route) },
    useLocalSearchParams: () => ({}),
  },
  '../services/explorationLocation': {
    saveLocation: () => {
      throw new Error('selection must not change location');
    },
  },
  '../utils/appDiagnostics': { logAppError() {} },
};
const api = {};
new Function('require', 'exports', source)((name) => modules[name] ?? {}, api);
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
}
const tree = api.default();
const rows = walk(tree).filter(
  (node) =>
    node.type === 'Pressable' &&
    node.props.accessibilityLabel?.includes('시장') &&
    node.props.accessibilityLabel !== '검색어 지우기',
);
assert.equal(rows.length, 3);
assert.equal(new Set(rows.map((row) => row.key)).size, 3);
rows[0].props.onPress();
rows[1].props.onPress();
assert.equal(alerts.length, 2);
assert.equal(routes.length, 0);
assert.match(alerts[0][1], /등록되지 않은/);
rows[2].props.onPress();
assert.equal(routes.length, 1);
assert.deepEqual(routes[0], {
  pathname: '/markets/[marketId]',
  params: {
    marketId: '7',
    marketName: '등록 시장',
    marketDistanceMeters: '300',
  },
});
console.log(
  'PASS: unique nullable-market keys, unregistered selection shows guidance without navigation, registered selection uses internal ID and preserves location',
);
