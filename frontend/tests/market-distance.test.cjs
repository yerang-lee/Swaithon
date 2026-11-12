const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
const helpers = {};
new Function('exports', compile('src/utils/marketDistance.ts'))(helpers);
for (const invalid of [
  undefined,
  null,
  '',
  ' ',
  '-1',
  'Infinity',
  'NaN',
  'abc',
  [],
])
  assert.equal(helpers.parseMarketDistance(invalid), null);
assert.equal(helpers.parseMarketDistance('0'), 0);
assert.equal(helpers.parseMarketDistance('350'), 350);
assert.equal(helpers.formatMarketDistance(350), '0.3km');
assert.equal(helpers.formatMarketDistance(0), '0.0km');
assert.deepEqual(helpers.marketDistanceParams(null), {});
assert.deepEqual(helpers.marketDistanceParams(350), {
  marketDistanceMeters: '350',
});
let revision = 0;
let state,
  scheduled = [],
  cleanup,
  nearbyCalls = [],
  requests = [],
  saved = { latitude: 37.55, longitude: 126.91, radius: 3, name: '위치' };
const hook = {};
new Function('require', 'exports', compile('src/hooks/useMarketDistance.ts'))(
  (name) =>
    name === '../services/locationChanges'
      ? { useLocationRevision: () => revision }
      : name === 'react'
        ? {
            useEffect: (fn) => scheduled.push(fn),
            useState: () => [
              state,
              (value) => {
                state = value;
              },
            ],
          }
        : name === '../utils/marketDistance'
          ? helpers
          : name === '../services/api/markets'
            ? {
                getNearbyMarkets: (location) => {
                  nearbyCalls.push(location);
                  return new Promise((resolve) => requests.push(resolve));
                },
              }
            : name === '../services/explorationLocation'
              ? {
                  readLocation: async () => saved,
                  getCurrentLocation: async () => {
                    throw new Error('saved location exists');
                  },
                }
              : { logAppError() {} },
  hook,
);
const render = (id, passed) => {
  cleanup?.();
  const value = hook.useMarketDistance(id, passed);
  cleanup = scheduled.shift()();
  return value;
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  assert.equal(render(1, '350'), 350);
  assert.equal(nearbyCalls.length, 0);
  assert.equal(render(5), null);
  await tick();
  assert.deepEqual(nearbyCalls[0], saved);
  requests.shift()([
    { market_id: null, distance: 1 },
    { market_id: 5, distance: 420 },
  ]);
  await tick();
  assert.equal(render(5), 420);
  await tick();
  const stale = requests.shift();
  assert.equal(render(6), null);
  await tick();
  const current = requests.shift();
  current([{ market_id: 6, distance: 900 }]);
  await tick();
  stale([{ market_id: 5, distance: 10 }]);
  await tick();
  assert.equal(state.key, '6::0');
  assert.equal(state.distance, 900);
  assert.equal(render(7), null);
  await tick();
  requests.shift()([{ market_id: 8, distance: 100 }]);
  await tick();
  assert.equal(state.distance, null);
  assert.equal(helpers.formatMarketDistance(900).includes('시장'), false);
  revision = 1;
  assert.equal(render(6, '350'), null);
  await tick();
  requests.at(-1)([{ market_id: 6, distance: 1600 }]);
  await tick();
  assert.equal(state.distance, 1600);
  assert.equal(state.key, '6:350:1');
  console.log(
    'PASS: distance-only formatting, route validation/zero, inherited distance avoids requests, direct entry uses exact market ID, stale response suppression and unavailable distance stays null',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
