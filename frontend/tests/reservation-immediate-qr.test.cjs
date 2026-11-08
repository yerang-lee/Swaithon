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
const mock = {};
new Function(
  'require',
  'exports',
  '__DEV__',
  'process',
  'setTimeout',
  compile('src/services/devMock.ts'),
)(
  () => ({}),
  mock,
  true,
  { env: {} },
  (fn) => {
    fn();
    return 0;
  },
);
const service = {};
let session;
class ApiError extends Error {
  constructor(status) {
    super('request failed');
    this.status = status;
  }
}
new Function('require', 'exports', compile('src/services/api/reservations.ts'))(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          getJson: (url, token) =>
            mock.mockRequest(url, 'GET', undefined, token),
          postJson: (url, body, token, status) => {
            assert.equal(status, 201);
            return mock.mockRequest(url, 'POST', body, token);
          },
        },
  service,
);
const jsx = (type, props, key) => ({ type, props, key });
function walk(node) {
  return !node || typeof node !== 'object'
    ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
}
(async () => {
  session = {
    access_token: (
      await mock.mockRequest('/auth/login', 'POST', { phone: '01000000002' })
    ).access_token,
    expiresAt: Date.now() + 3600000,
  };
  const product = await mock.mockRequest('/products/1002', 'GET');
  const pickup = new Date(Date.now() + 86400000);
  pickup.setHours(15, 0, 0, 0);
  const created = await service.reserveProduct(
    '1002',
    String(product.product_id),
    1,
    pickup,
    '',
  );
  assert.equal(typeof created.reservation_id, 'string');
  assert.equal(created.status, 'PENDING');
  const detail = await service.getReservationDetail(
    service.reservationDetailId(created.reservation_id),
  );
  assert.equal(detail.status, 'PENDING');
  assert.equal(detail.qr_code_data, null);
  assert.equal(detail.qr_code_expires_at, null);
  assert.equal(service.reservationDetailId('reservation_501'), null);
  assert.equal(service.reservationDetailId('501'), 501);
  assert.equal(service.reservationDetailId(501), 501);
  let cursor = 0,
    states = { 0: product, 1: false, 5: true },
    routes = [],
    alerts = [];
  const productApi = {};
  const modules = {
    react: {
      useState: (initial) => {
        const i = cursor++;
        return [
          i in states ? states[i] : initial,
          (value) => {
            states[i] = value;
          },
        ];
      },
      useRef: (value) => ({ current: value }),
      useEffect() {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      StyleSheet: { create: (s) => s },
      View: 'View',
      Text: 'Text',
      Pressable: 'Pressable',
      Alert: { alert: (...args) => alerts.push(args) },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': {
      router: { push: (route) => routes.push(route) },
      useLocalSearchParams: () => ({ listingId: '1002' }),
    },
    '../../services/catalogChanges': { useCatalogRevision: () => 0 },
    '../../data/demoProducts': { demoProducts: [] },
    '../../hooks/useMarketDistance': { useMarketDistance: () => 300 },
    '../../utils/marketDistance': {
      marketDistanceParams: () => ({}),
      formatMarketDistance: () => '0.3km',
    },
    '../../hooks/useFavorites': {
      useFavorites: () => ({
        favorites: [],
        pendingFavorites: [],
        toggleFavorite() {},
      }),
    },
    '../../hooks/useRecommendationTracking': { useRecommendationView() {} },
    '../../services/api/reservations': service,
    '../../components/reservations/PickupTimeSheet': {
      PickupTimeSheet: 'PickupTimeSheet',
    },
    '../../utils/appDiagnostics': { logAppError() {} },
  };
  new Function(
    'require',
    'exports',
    compile('src/app/products/[listingId].tsx'),
  )((name) => modules[name] ?? {}, productApi);
  const productTree = productApi.default();
  await walk(productTree)
    .find((node) => node.type === 'PickupTimeSheet')
    .props.onConfirm(pickup, 1, '');
  assert.equal(alerts.length, 0);
  assert.equal(routes.at(-1).pathname, '/reservations/[reservationId]');
  const reservationId = routes.at(-1).params.reservationId;
  assert.ok(Number.isSafeInteger(Number(reservationId)));
  let slots = [],
    refs = [],
    i = 0,
    j = 0,
    focus;
  const routeApi = {};
  const routeModules = {
    react: {
      useState: (initial) => {
        const index = i++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (value) => {
            slots[index] =
              typeof value === 'function' ? value(slots[index]) : value;
          },
        ];
      },
      useRef: (value) => {
        const index = j++;
        return (refs[index] ??= { current: value });
      },
      useCallback: (fn) => fn,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      StyleSheet: { create: (s) => s },
      View: 'View',
      Text: 'Text',
      AppState: { addEventListener: () => ({ remove() {} }) },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': {
      router: {},
      useLocalSearchParams: () => ({ reservationId }),
      useFocusEffect: (fn) => (focus = fn),
    },
    '../../services/api/reservations': service,
    '../../services/api/auth': { getAuthSession: () => session },
    '../../services/devMock': { isMockMode: () => true },
    '../../components/reservations/ReservationPickupQr': {
      ReservationPickupQr: 'ReservationPickupQr',
    },
    '../../utils/appDiagnostics': { logAppError() {} },
  };
  new Function(
    'require',
    'exports',
    compile('src/app/reservations/[reservationId].tsx'),
  )((name) => routeModules[name] ?? {}, routeApi);
  const render = () => {
    i = j = 0;
    return routeApi.default();
  };
  render();
  const cleanup = focus();
  await new Promise((resolve) => setImmediate(resolve));
  const panel = walk(render()).find(
    (node) => node.type === 'ReservationPickupQr',
  ).props;
  assert.equal(panel.loading, false);
  assert.equal(panel.detail.status, 'PENDING');
  assert.equal(panel.detail.qr_code_data, null);
  assert.equal(panel.testMode, true);
  cleanup();
  const listed = await mock.mockRequest(
    '/users/me/reservations?page=1&size=10',
    'GET',
    undefined,
    session.access_token,
  );
  assert.equal(listed.reservations[0].reservation_id, Number(reservationId));
  console.log(
    'PASS: mock server booking creates PENDING reservation, navigates to detail with null QR without a client status update request, preserves listing and refuses opaque ID guessing',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
