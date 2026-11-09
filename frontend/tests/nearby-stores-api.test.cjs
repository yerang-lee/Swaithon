const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/services/api/nearbyStores.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let handler,
  calls = [];
const api = {};
new Function('require', 'exports', source)(
  () => ({
    getMarketStores: async (id, page) => {
      calls.push({ id, page });
      return handler(id, page);
    },
  }),
  api,
);
const market = (id) => ({
  market_id: id,
  market_name: '시장' + id,
  distance: id ?? 0,
});
const store = (id) => ({
  store_id: id,
  store_name: '가게' + id,
  category: null,
  address: null,
  image_url: null,
});
(async () => {
  handler = async (id, page) =>
    id === 1
      ? {
          stores:
            page === 1
              ? Array.from({ length: 10 }, (_, i) => store(i + 1))
              : [store(11), store(12)],
          total_count: 12,
          size: 10,
          page,
        }
      : { stores: [store(1), store(21)], total_count: 2, size: 10, page };
  const result = await api.getStoresForNearbyMarkets([
    market(null),
    market(1),
    market(1),
    market(2),
  ]);
  assert.equal(result.failedMarketCount, 0);
  assert.deepEqual(
    result.stores.map((s) => s.store_id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 21],
  );
  assert.equal(result.stores[0].market_id, 1);
  assert.equal(result.stores[0].market_distance, 1);
  assert.equal(result.stores.at(-1).market_distance, 2);
  assert.equal(result.stores[0].image_url, null);
  assert.deepEqual(
    calls.filter((c) => c.id === 1).map((c) => c.page),
    [1, 2],
  );
  assert.equal(
    calls.some((c) => c.id === null),
    false,
  );
  let inflight = 0,
    max = 0;
  calls = [];
  handler = async (id, page) => {
    inflight++;
    max = Math.max(max, inflight);
    await new Promise((resolve) => setImmediate(resolve));
    inflight--;
    return { stores: [store(id)], total_count: 1, size: 10, page };
  };
  const concurrent = await api.getStoresForNearbyMarkets(
    [1, 2, 3, 4, 5].map(market),
  );
  assert.equal(max, 3);
  assert.deepEqual(
    concurrent.stores.map((s) => s.store_id),
    [1, 2, 3, 4, 5],
  );
  calls = [];
  handler = async (id, page) => {
    if (id === 1 && page === 2) throw new Error('unavailable');
    return {
      stores:
        id === 1
          ? Array.from({ length: 10 }, (_, i) => store(i + 1))
          : [store(20)],
      total_count: id === 1 ? 11 : 1,
      size: 10,
      page,
    };
  };
  const partial = await api.getStoresForNearbyMarkets([market(1), market(2)]);
  assert.equal(partial.failedMarketCount, 1);
  assert.equal(partial.stores.length, 11);
  calls = [];
  handler = async (id, page) => ({
    stores: [],
    total_count: 100,
    size: 10,
    page,
  });
  assert.equal(
    (await api.getStoresForNearbyMarkets([market(1)])).failedMarketCount,
    1,
  );
  assert.equal(calls.length, 1);
  calls = [];
  let active = false;
  assert.deepEqual(
    await api.getStoresForNearbyMarkets([market(1)], () => active),
    { stores: [], failedMarketCount: 0 },
  );
  assert.equal(calls.length, 0);
  active = true;
  handler = async (id, page) => {
    active = false;
    return { stores: [store(1)], total_count: 20, size: 10, page };
  };
  assert.deepEqual(
    await api.getStoresForNearbyMarkets([market(1), market(2)], () => active),
    { stores: [], failedMarketCount: 0 },
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(await api.getStoresForNearbyMarkets([market(null)]), {
    stores: [],
    failedMarketCount: 0,
  });
  console.log(
    'PASS: registered markets only, all store pages, stable ordering/deduplication, max 3 requests, partial failure, no-progress guard and stale-load cancellation',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
