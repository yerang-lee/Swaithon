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
const presentation = {};
new Function('exports', compile('src/utils/voiceCommandPresentation.ts'))(
  presentation,
);
const jsx = (type, props) => ({ type, props });
let confirmed = 0;
let stateIndex = 0;
let selectedPhoto = null;
const uploads = [];
const logged = [];
const routes = [];
const modules = {
  react: { useState: (initial) => [
    stateIndex++ % 4 === 0 && selectedPhoto ? selectedPhoto : initial, () => {},
  ] },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    Image: 'Image',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    View: 'View',
    StyleSheet: { create: (s) => s },
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-status-bar': { StatusBar: 'StatusBar' },
  'expo-router': { router: { push: (route) => routes.push(route) } },
  '../ui/PageHeader': { PageHeader: 'PageHeader' },
  '../../constants/theme': {
    theme: {
      colors: { primary: '#53B175' },
      button: { height: 56, radius: 12 },
    },
  },
  '../../utils/voiceCommandPresentation': presentation,
  '../../services/catalogChanges': { markCatalogChanged() {} },
  '../../utils/appDiagnostics': { logAppError: (...args) => logged.push(args) },
  '../../services/api/images': {
    uploadProductImage: async (...args) => uploads.push(args),
  },
};
const api = {};
new Function(
  'require',
  'exports',
  compile('src/components/merchant/CommandResultScreen.tsx'),
)((name) => modules[name] ?? {}, api);
const command = {
  command_id: 'command-1',
  status: 'READY',
  intent: 'PRODUCT_CREATE',
  analysis_result: {
    product_name: '사과',
    price: 10000,
    unit: '한 봉지',
    category: 'FRUIT',
    category_name: '과일',
  },
  execution_endpoint: null,
  preview: { before: null, after: null },
  result: null,
};
assert.equal(presentation.confirmedListingId({
  ...command, status: 'SUCCEEDED', result: { product_id: 7, listing_id: '42' },
}), 42);
for (const listing_id of [undefined, null, '', 'pending', '1.5', ' 42 ', 0, -1, 1.5, NaN, Infinity, '9007199254740992']) {
  assert.equal(presentation.confirmedListingId({
    ...command, status: 'SUCCEEDED', result: { product_id: 7, listing_id },
  }), null);
}
assert.equal(presentation.confirmedListingId({
  ...command, result: { product_id: 7 },
}), null);
const props = {
  command,
  busy: false,
  error: '',
  uncertain: false,
  disabled: false,
  onConfirm: async () => {
    confirmed++;
    return null;
  },
  onAgain() {},
  onHome() {},
  onBack() {},
};
function nodes(tree) {
  return !tree || typeof tree !== 'object'
    ? []
    : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(tree) {
  return typeof tree === 'string'
    ? tree
    : !tree || typeof tree !== 'object'
      ? ''
      : [tree.props?.children].flat(Infinity).map(text).join('');
}
(async () => {
  let tree = api.CommandResultScreen(props);
  assert.ok(text(tree).includes('AI 분석 결과'));
  assert.ok(text(tree).includes('사과 한 봉지'));
  assert.ok(text(tree).includes('10,000원'));
  assert.ok(!text(tree).includes('상품이 등록되었어요!'));
  let button = nodes(tree).find(
    (node) => node.type === 'Pressable' && text(node) === '이대로 등록하기',
  );
  assert.equal(button.props.disabled, true);
  assert.equal(confirmed, 0);
  tree = api.CommandResultScreen({
    ...props,
    command: {
      ...command,
      execution_endpoint: '/voice/product-registration/confirm',
    },
  });
  button = nodes(tree).find(
    (node) => node.type === 'Pressable' && text(node) === '이대로 등록하기',
  );
  assert.equal(button.props.disabled, false);
  button.props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(confirmed, 1);
  tree = api.CommandResultScreen({
    ...props,
    command: {
      ...command,
      status: 'SUCCEEDED',
      result: { product_id: 1 },
      execution_endpoint: null,
    },
  });
  nodes(tree)
    .find((node) => node.type === 'Pressable' && text(node) === '내 상품 보기')
    .props.onPress();
  assert.equal(routes.pop(), '/my-store');
  selectedPhoto = { uri: 'file:///photo.jpg' };
  for (const result of [{ product_id: 7, listing_id: '42' }, { product_id: 7 }]) {
    tree = api.CommandResultScreen({
      ...props, command: { ...command, status: 'SUCCEEDED', result },
    });
    assert.ok(!text(tree).includes('다시 등록하기'));
    assert.ok(text(tree).includes('내 상품 보기'));
    nodes(tree).find((node) => node.type === 'Pressable' &&
      text(node) === '사진 업로드 다시 시도').props.onPress();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(confirmed, 1, 'photo retry must not confirm the product again');
  assert.deepEqual(uploads, [[selectedPhoto, 42]], 'use listing_id, never product_id');
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], 'voice/result/upload');
  console.log(
    'PASS: READY analysis shows product/price/unit without success claim, missing server execute path blocks submission, server path plus user confirmation enables apply',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
