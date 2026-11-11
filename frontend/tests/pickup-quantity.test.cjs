const fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), assert = require('node:assert/strict');
let values = [], cursor = 0;
const jsx = (type, props) => ({ type, props });
class Value { interpolate() { return 1; } }
const slot = new Date(2026, 10, 11, 15, 30);
const modules = {
  react: {
    useState(initial) {
      const i = cursor++;
      if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
      return [values[i], (value) => { values[i] = typeof value === 'function' ? value(values[i]) : value; }];
    },
    useRef: (value) => ({ current: value }), useMemo: (fn) => fn(),
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    Animated: { Value, FlatList: 'FlatList', event: () => () => {} },
    Modal: 'Modal', View: 'View', Pressable: 'Pressable', Text: 'Text',
    StyleSheet: { create: (s) => s },
  },
  'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider',
    initialWindowMetrics: { insets: { bottom: 34 } }, useSafeAreaInsets: () => ({ bottom: 0 }) },
  '../ui/AppIcon': { AppIcon: 'AppIcon' },
  '../ui/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  '../../utils/pickupTimes': { pickupTimes: () => [slot], dayLabel: () => '오늘', timeLabel: () => '오후 3:30' },
};
const api = {};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../src/components/reservations/PickupTimeSheet.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function('require', 'exports', source)((name) => modules[name], api);
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] :
  [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const confirmations = [];
const props = { onClose() {}, onConfirm: (...args) => confirmations.push(args),
  favorite: false, onToggleFavorite() {} };
function render(extra = {}) { cursor = 0; return nodes(api.PickupTimeSheet({ ...props, ...extra })); }
const find = (label, extra) => render(extra).find((node) => node.props.accessibilityLabel === label);
assert.equal(find('예약 수량 줄이기').props.disabled, true);
find('예약 수량 늘리기').props.onPress();
find('예약 수량 늘리기').props.onPress();
assert.ok(find('예약 수량 3개'));
render().find((node) => node.type === 'PrimaryButton').props.onPress();
assert.deepEqual(confirmations, [[slot, 3, '']]);
find('예약 수량 줄이기').props.onPress();
assert.ok(find('예약 수량 2개'));
assert.equal(find('예약 수량 늘리기', { submitting: true }).props.disabled, true);
assert.equal(find('예약 수량 줄이기', { submitting: true }).props.disabled, true);
render({ submitting: true }).find((node) => node.type === 'PrimaryButton').props.onPress();
assert.equal(confirmations.length, 1);
assert.equal(render().some((node) => node.type === 'SafeAreaProvider'), true);
console.log('PASS: quantity controls, minimum one, selected quantity forwarded, submit lock and modal safe area');
