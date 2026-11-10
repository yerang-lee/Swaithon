const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/pickup-scan.tsx'), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
let cursor = 0,
  refsCursor = 0,
  states = [],
  refs = [],
  focus,
  appState,
  calls = [],
  resolve,
  reject;
let session = { access_token: 'merchant', role: 'MERCHANT' };
const element = (type, props) => ({ type, props });
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
      const i = refsCursor++;
      return refs[i] ?? (refs[i] = { current: initial });
    },
    useCallback: (fn) => fn,
  },
  'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
  'react-native': {
    ActivityIndicator: 'ActivityIndicator',
    AppState: {
      currentState: 'active',
      addEventListener: (_, callback) => {
        appState = callback;
        return { remove() {} };
      },
    },
    Linking: {},
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: { create: (s) => s, absoluteFill: {} },
    Text: 'Text',
    View: 'View',
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: { replace: (route) => calls.push(route) },
    useFocusEffect: (fn) => {
      focus = fn;
    },
  },
  'expo-camera': {
    CameraView: 'CameraView',
    useCameraPermissions: () => [{ granted: true }, async () => {}],
  },
  '../components/ui/PageHeader': { PageHeader: 'PageHeader' },
  '../components/ui/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  '../services/api/auth': { getAuthSession: () => session },
  '../services/api/pickup': {
    verifyPickup: (data) => {
      calls.push(data);
      return new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
    },
  },
  '../utils/appDiagnostics': { logAppError() {} },
  '../services/devMock': { useMockMode: () => false },
};
const api = {};
new Function('require', 'exports', source)((name) => modules[name], api);
const render = () => {
  cursor = refsCursor = 0;
  return api.default();
};
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
function find(type) {
  return nodes(render()).find((n) => n.type === type);
}
const settle = () => new Promise((done) => setImmediate(done));
(async () => {
  render();
  const blur = focus();
  let camera = find('CameraView');
  assert.ok(camera);
  assert.deepEqual(camera.props.barcodeScannerSettings.barcodeTypes, ['qr']);
  camera.props.onBarcodeScanned({ data: 'private-pickup-token' });
  camera.props.onBarcodeScanned({ data: 'private-pickup-token' });
  assert.equal(calls.length, 1);
  assert.equal(find('CameraView'), undefined);
  resolve({
    product_name: '사과',
    store_name: '가게',
    reservation_id: 501,
    completed_at: '2026-11-09T15:00:00+09:00',
  });
  await settle();
  assert.equal(find('CameraView'), undefined);
  const listLink = find('Pressable');
  assert.equal(listLink.props.children.props.children, '예약 목록으로');
  listLink.props.onPress();
  assert.deepEqual(calls.pop(), { pathname: '/home', params: { tab: '예약' } });
  const texts = nodes(render())
    .filter((node) => node.type === 'Text')
    .map((node) => [node.props.children].flat().join(''));
  assert.ok(texts.includes('픽업이 완료되었어요'));
  assert.ok(
    !texts.some(
      (value) =>
        value.includes('예약 번호') ||
        value.includes('2026') ||
        value === '사과',
    ),
  );
  assert.ok(!texts.includes('가게'));
  let button = find('PrimaryButton');
  assert.equal(button.props.title, '다음 QR 스캔하기');
  button.props.onPress();
  camera = find('CameraView');
  assert.ok(camera);
  camera.props.onBarcodeScanned({ data: 'expired' });
  reject(new Error('만료된 QR이에요.'));
  await settle();
  assert.equal(find('CameraView'), undefined);
  button = find('PrimaryButton');
  assert.equal(button.props.title, '다시 스캔하기');
  button.props.onPress();
  appState('background');
  assert.equal(find('CameraView'), undefined);
  const before = calls.length;
  camera.props.onBarcodeScanned({ data: 'background' });
  assert.equal(calls.length, before);
  appState('active');
  assert.ok(find('CameraView'));
  find('CameraView').props.onBarcodeScanned({ data: 'last' });
  blur();
  resolve({ product_name: 'old', completed_at: '2026-11-09T15:00:00Z' });
  await settle();
  assert.equal(find('CameraView'), undefined);
  session = { role: 'CUSTOMER' };
  assert.equal(find('CameraView'), undefined);
  console.log(
    'PASS: merchant-only QR camera, synchronous duplicate scan lock, pending/result/error camera stop, explicit rescan, background stop and stale navigation response guards',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
