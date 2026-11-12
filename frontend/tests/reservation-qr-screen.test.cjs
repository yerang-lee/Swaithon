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
const jsx = (type, props, key) => ({ type, props, key });
let slots = [],
  refs = [],
  cursor = 0,
  refCursor = 0,
  effectCursor = 0,
  effects = [],
  pending = [],
  intervals = new Map(),
  sequence = 0,
  now = Date.now(),
  logs = [];
class ClockDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [now]));
  }
  static now() {
    return now;
  }
}
const react = {
  useState: (initial) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [
      slots[i],
      (value) => {
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      },
    ];
  },
  useRef: (value) => {
    const i = refCursor++;
    return (refs[i] ??= { current: value });
  },
  useEffect: (fn, deps) => {
    const i = effectCursor++;
    if (
      !effects[i] ||
      deps.some((value, index) => value !== effects[i].deps[index])
    ) {
      effects[i]?.cleanup?.();
      effects[i] = { deps };
      pending.push(() => (effects[i].cleanup = fn()));
    }
  },
};
const api = {};
new Function(
  'require',
  'exports',
  'Date',
  'setInterval',
  'clearInterval',
  compile('src/components/reservations/ReservationPickupQr.tsx'),
)(
  (name) =>
    name === '../../services/api/reservations'
      ? {
          isPickupQrEligible: (status) => status === 'READY',
        }
      : name === 'react'
        ? react
        : name === 'react/jsx-runtime'
          ? { jsx, jsxs: jsx }
          : name === 'react-native'
            ? {
                StyleSheet: { create: (s) => s },
                View: 'View',
                Text: 'Text',
                Pressable: 'Pressable',
                ActivityIndicator: 'ActivityIndicator',
                useWindowDimensions: () => ({ width: 320 }),
              }
            : name === 'react-native-qrcode-svg'
              ? { __esModule: true, default: 'QRCode' }
              : { logAppError: (_, error) => logs.push(error.message) },
  api,
  ClockDate,
  (fn) => {
    const id = ++sequence;
    intervals.set(id, fn);
    return id;
  },
  (id) => intervals.delete(id),
);
const detail = {
  reservation_id: 501,
  listing_id: 101,
  product_id: 1,
  product_name: '사과',
  store_id: 1,
  store_name: '과일가게',
  quantity: 2,
  total_price: 10000,
  status: 'READY',
  created_at: new Date(now).toISOString(),
  qr_code_data: 'TEST_ONLY_PICKUP_PANEL',
  qr_code_expires_at: new Date(now + 10000).toISOString(),
};
let refreshes = 0;
const render = (extra = {}) => {
  cursor = 0;
  refCursor = 0;
  effectCursor = 0;
  pending = [];
  const tree = api.ReservationPickupQr({
    detail,
    loading: false,
    error: '',
    onRefresh: () => refreshes++,
    ...extra,
  });
  pending.forEach((fn) => fn());
  return tree;
};
function walk(node) {
  return !node || typeof node !== 'object'
    ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
}
function text(node) {
  return typeof node === 'string'
    ? node
    : node && typeof node === 'object'
      ? [node.props?.children].flat(Infinity).map(text).join('')
      : '';
}
const qr = (tree) => walk(tree).find((node) => node.type === 'QRCode');
(async () => {
  let tree = render();
  assert.equal(qr(tree).props.value, detail.qr_code_data);
  assert.equal(qr(tree).props.quietZone, 24);
  assert.ok(!text(tree).includes('테스트용 QR'));
  assert.ok(text(tree).includes('유효기간:'));
  assert.equal(text(tree).includes(detail.qr_code_data), false);
  assert.equal(qr(render({ loading: true })), undefined);
  assert.equal(qr(render({ error: '상세 조회 실패' })), undefined);
  assert.equal(qr(render({ disabled: true })), undefined);
  for (const status of ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'])
    assert.equal(
      qr(
        render({
          detail: {
            ...detail,
            status,
            qr_code_data: null,
            qr_code_expires_at: null,
          },
        }),
      ),
      undefined,
    );
  assert.ok(
    text(render({ detail: null, status: 'CANCELLED' })).includes('취소된 예약'),
  );
  tree = render();
  qr(tree).props.onError(new Error(detail.qr_code_data));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(qr(render()), undefined);
  assert.ok(logs.every((message) => !message.includes(detail.qr_code_data)));
  tree = render({ detail: { ...detail, qr_code_data: 'TEST_ONLY_REPLACED' } });
  tree = render({ detail: { ...detail, qr_code_data: 'TEST_ONLY_REPLACED' } });
  assert.ok(qr(tree));
  now += 11000;
  intervals.forEach((fn) => fn());
  tree = render({ detail: { ...detail, qr_code_data: 'TEST_ONLY_REPLACED' } });
  assert.equal(qr(tree), undefined);
  assert.ok(text(tree).includes('만료'));
  walk(tree)
    .find(
      (node) => node.type === 'Pressable' && text(node) === 'QR 다시 발급받기',
    )
    .props.onPress();
  assert.equal(refreshes, 1);
  // Use the same encoder as the installed native component, not a decorative QR drawing.
  const symbol = require('qrcode').create(detail.qr_code_data, {
    errorCorrectionLevel: 'M',
  });
  assert.ok(symbol.modules.size >= 21);
  assert.ok(symbol.modules.data.some((value) => value === 1));
  assert.ok(symbol.modules.data.some((value) => value === 0));
  console.log(
    'PASS: real QR encoding, exact server value, test label/expiry, READY-only QR and hidden pending/confirmed/completed/loading/error/cancelled QR, expiry refresh and sanitized rendering errors',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
