const fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), assert = require('node:assert/strict');
const compile = (file) => ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX } }).outputText;
process.env.EXPO_PUBLIC_API_URL = 'https://api.test/api';
const urls = {};
new Function('exports', compile('src/utils/imageUrl.ts'))(urls);
let values = [], effects = [], index = 0, effectIndex = 0, revision = 0;
const requests = [], logs = [];
const modules = {
  react: {
    useState(initial) {
      const i = index++;
      if (!(i in values)) values[i] = initial;
      return [values[i], (value) => { values[i] = value; }];
    },
    useEffect(fn, deps) {
      const i = effectIndex++, old = effects[i];
      if (!old || deps.some((v, n) => v !== old.deps[n])) {
        old?.cleanup?.(); effects[i] = { deps, cleanup: fn() };
      }
    },
  },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  'react-native': { Image: 'Image', View: 'View' },
  '../../utils/imageUrl': urls,
  '../../services/catalogChanges': { useCatalogRevision: () => revision },
  '../../services/api/products': { getProduct: (id) => new Promise((resolve, reject) => {
    requests.push({ id, resolve, reject });
  }) },
  '../../utils/appDiagnostics': { logAppError: (...args) => logs.push(args) },
};
const api = {};
new Function('require', 'exports', compile('src/components/products/ListingImage.tsx'))(
  (name) => modules[name], api);
let props = { listingId: 42, uri: null, label: '상품 사진', style: { width: 84, height: 84 } };
function render() { index = 0; effectIndex = 0; return api.ListingImage(props); }
const tick = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  assert.equal(render().type, 'View');
  assert.equal(requests[0].id, '42');
  requests[0].resolve({ image_url: '/uploads/images/apple.png' });
  await tick();
  assert.equal(render().props.source.uri, 'https://api.test/uploads/images/apple.png');
  render(); assert.equal(requests.length, 1);
  props = { ...props, listingId: 43, uri: '/uploads/images/old.png' };
  let tree = render();
  assert.equal(tree.props.source.uri, 'https://api.test/uploads/images/old.png');
  assert.equal(requests.length, 1, 'existing list URL avoids detail fetch');
  tree.props.onError(); render();
  assert.equal(requests[1].id, '43');
  requests[1].resolve({ image_url: '/uploads/images/new.png' }); await tick();
  assert.equal(render().props.source.uri, 'https://api.test/uploads/images/new.png');
  props = { ...props, listingId: 44, uri: null }; render();
  props = { ...props, listingId: 45 }; render();
  requests[2].resolve({ image_url: '/uploads/images/wrong-owner.png' }); await tick();
  assert.equal(render().type, 'View', 'stale listing fetch must not paint a different card');
  requests[3].resolve({ image_url: null }); await tick();
  assert.equal(render().type, 'View');
  revision++; render();
  assert.equal(requests.length, 5, 'catalog updates retry missing images');
  requests[4].reject(new Error('private-response')); await tick();
  assert.equal(JSON.stringify(logs).includes('private-response'), false);
  assert.equal(render().type, 'View');
  console.log('PASS: relative list image, detail fallback, image failure recovery, stale isolation, catalog refresh and safe errors');
})().catch((error) => { console.error(error); process.exitCode = 1; });
