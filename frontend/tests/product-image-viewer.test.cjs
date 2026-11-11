const fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), assert = require('node:assert/strict');
const api = {}, jsx = (type, props) => ({ type, props });
const logs = [];
const modules = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { Image: 'Image', Modal: 'Modal', Pressable: 'Pressable',
    Text: 'Text', View: 'View', StyleSheet: { create: (s) => s } },
  'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' },
  'expo-status-bar': { StatusBar: 'StatusBar' },
  '../../utils/appDiagnostics': { logAppError: (...args) => logs.push(args) },
};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../src/components/products/ProductImageViewer.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function('require', 'exports', code)((name) => modules[name], api);
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] :
  [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
let closed = 0;
const tree = api.ProductImageViewer({ visible: true,
  uri: 'https://api.test/uploads/photo.jpg', label: '사과 사진', onClose: () => closed++ });
assert.equal(tree.type, 'Modal');
assert.equal(tree.props.presentationStyle, 'fullScreen');
assert.equal(tree.props.children.type, 'SafeAreaProvider');
const all = nodes(tree);
assert.deepEqual(all.find((n) => n.type === 'SafeAreaView').props.edges,
  ['top', 'bottom', 'left', 'right']);
const image = all.find((n) => n.type === 'Image');
assert.equal(image.props.resizeMode, 'contain');
all.find((n) => n.type === 'Pressable').props.onPress();
tree.props.onRequestClose();
assert.equal(closed, 2);
image.props.onError();
assert.equal(logs.length, 1);
console.log('PASS: full-screen photo viewer, independent safe area, close button/system dismissal and safe image error');
