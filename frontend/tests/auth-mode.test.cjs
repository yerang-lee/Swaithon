const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/components/auth/AuthScreen.tsx'),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
let mock = false,
  states = [],
  index = 0,
  loginCalls = [],
  signupCalls = [],
  routes = [],
  cleared = 0;
const element = (type, props) => ({ type, props });
const react = {
  useState(initial) {
    const slot = index++;
    if (!(slot in states)) states[slot] = initial;
    return [
      states[slot],
      (value) => {
        states[slot] = value;
      },
    ];
  },
};
const auth = {
  clearAuthSession() {
    cleared++;
  },
  async login(phone, password) {
    loginCalls.push({ phone, password, mock });
  },
  async signup(name, phone, password) {
    signupCalls.push({ name, phone, mock });
    return { user_id: 1 };
  },
};
const modules = {
  react,
  'react/jsx-runtime': { jsx: element, jsxs: element },
  'react-native': {
    StyleSheet: { create: (s) => s },
    Platform: { OS: 'ios' },
    Alert: { alert() {} },
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': {
    router: { push: (r) => routes.push(r), replace: (r) => routes.push(r) },
  },
  '../ui/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  '../ui/AuthField': { AuthField: 'AuthField' },
  './BrandLogo': { BrandLogo: 'BrandLogo' },
  '../../constants/theme': { theme: { colors: {} } },
  '../../services/api/auth': auth,
  '@react-native-async-storage/async-storage': {
    default: { async setItem() {} },
  },
  './SignupRoleStep': { SignupRoleStep: 'SignupRoleStep' },
  '../../services/api/onboarding': {
    async registerOnboarding() {
      assert.equal(mock, false);
      return { role: 'CUSTOMER' };
    },
  },
  '../../services/api/client': { ApiError: class extends Error {} },
  '../../utils/apiDiagnostics': { logApiError() {} },
  '../../utils/appDiagnostics': { logAppError() {} },

  '../../hooks/useFavorites': { clearFavorites() {} },
};
const api = {};
new Function('require', 'exports', '__DEV__', source)(
  (name) => {
    assert.ok(name in modules, name);
    return modules[name];
  },
  api,
  true,
);
function render(mode = 'login') {
  index = 0;
  return api.AuthScreen({ mode });
}
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
}
function label(node) {
  return [node?.props?.children]
    .flat(Infinity)
    .filter((v) => typeof v === 'string')
    .join('');
}
function fields() {
  states = [];
  states[0] = '닉네임';
  states[1] = '01012345678';
  states[3] = 'test-password';
  states[4] = 'test-password';
}
(async () => {
  fields();
  let tree = render();
  await walk(tree)
    .find((n) => n.type === 'PrimaryButton')
    .props.onPress();
  assert.equal(mock, false);
  assert.equal(loginCalls.at(-1).mock, false);
  assert.equal(cleared, 0);
  assert.equal(routes.at(-1), '/home');
  assert.ok(!walk(tree).some(n => label(n).includes('테스트')));
  fields();
  tree = render('signup');
  await walk(tree)
    .find((n) => n.type === 'PrimaryButton')
    .props.onPress();
  assert.equal(mock, false);
  tree = render('signup');
  assert.equal(tree.type, 'SignupRoleStep');
  await tree.props.onComplete({ role: 'customer' });
  assert.equal(signupCalls.at(-1).mock, false);
  assert.equal(loginCalls.at(-1).mock, false);
  console.log(
    'PASS: login and signup use server authentication; no offline test buttons',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
