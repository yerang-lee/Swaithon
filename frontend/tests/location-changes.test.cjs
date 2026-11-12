const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
const changes = {},
  api = {};
let notifications = 0,
  snapshot,
  unsubscribe,
  stored = null,
  fail = false,
  mock = false;
const mockLocation = {
  latitude: 37.5,
  longitude: 127,
  name: '이전 위치',
  radius: 1,
};
new Function('require', 'exports', compile('src/services/locationChanges.ts'))(
  () => ({
    useSyncExternalStore: (subscribe, getSnapshot) => {
      snapshot = getSnapshot;
      unsubscribe = subscribe(() => notifications++);
      return getSnapshot();
    },
  }),
  changes,
);
new Function(
  'require',
  'exports',
  compile('src/services/explorationLocation.ts'),
)(
  (name) =>
    name === './locationChanges'
      ? changes
      : name === '@react-native-async-storage/async-storage'
        ? {
            __esModule: true,
            default: {
              getItem: async () => stored,
              setItem: async (_, value) => {
                if (fail) throw new Error('storage failure');
                stored = value;
              },
            },
          }
        : {},
  api,
);
(async () => {
  assert.equal(changes.useLocationRevision(), 0);
  const next = { latitude: 37.6, longitude: 126.9, name: '새 위치', radius: 3 };
  await api.saveLocation(next);
  assert.equal(notifications, 1);
  assert.equal(snapshot(), 1);
  assert.deepEqual(await api.readLocation(), next);
  fail = true;
  await assert.rejects(
    api.saveLocation({ ...next, radius: 5 }),
    /storage failure/,
  );
  assert.equal(notifications, 1);
  console.log('PASS: location-changes real API and error handling');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
