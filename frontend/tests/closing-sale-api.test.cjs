const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
let nearbyCalls = 0,
  calls = [],
  activeCalls = 0,
  peak = 0,
  mode = 'normal';
const markets = [1, 2, 3, 4].map((id) => ({
  market_id: id,
  market_name: `시장${id}`,
  distance: id * 100,
}));
const product = (market, id, sale = 8000) => ({
  listing_id: id,
  market_id: market,
  price: 10000,
  sale_price: sale,
  is_on_sale: true,
  is_sold_out: false,
});
const api = {};
new Function('require', 'exports', compile('src/services/api/closingSale.ts'))(
  (name) =>
    name === './markets'
      ? {
          getNearbyMarkets: async () => {
            nearbyCalls++;
            return [
              ...markets,
              markets[0],
              { market_id: null, distance: 10 },
              { market_id: 5, distance: 9000 },
            ];
          },
        }
      : {
          getProducts: async (options) => {
            assert.equal(options.is_on_sale, true);
            assert.equal(options.is_sold_out, false);
            calls.push(options);
            activeCalls++;
            peak = Math.max(peak, activeCalls);
            await new Promise((resolve) => setImmediate(resolve));
            activeCalls--;
            if (mode === 'partial' && options.market_id === 2)
              throw new Error('server failure');
            const id = options.market_id * 100;
            if (mode === 'stuck')
              return {
                products: [product(options.market_id, id)],
                total_count: 5,
              };
            if (options.market_id === 1)
              return options.page === 1
                ? {
                    products: [product(1, 101), product(1, 102, 10000)],
                    total_count: 3,
                  }
                : { products: [product(1, 103, 0)], total_count: 3 };
            return {
              products: [product(options.market_id, id)],
              total_count: 1,
            };
          },
        },
  api,
);
(async () => {
  assert.equal(api.isClosingSaleTime(new Date('2026-11-09T06:59:59Z')), false);
  assert.equal(api.isClosingSaleTime(new Date('2026-11-09T07:00:00Z')), true);
  assert.equal(api.isClosingSaleTime(new Date('2026-11-09T14:59:59Z')), true);
  assert.equal(api.isClosingSaleTime(new Date('2026-11-09T15:00:00Z')), false);
  const location = {
    latitude: 37.5,
    longitude: 127,
    radius: 1,
    name: '선택 위치',
  };
  await api.getClosingSaleProducts(
    location,
    () => true,
    new Date('2026-11-09T06:00:00Z'),
  );
  assert.equal(nearbyCalls, 0);
  const result = await api.getClosingSaleProducts(
    location,
    () => true,
    new Date('2026-11-09T08:00:00Z'),
  );
  assert.deepEqual(
    result.products.map((p) => p.listing_id),
    [101, 103, 200, 300, 400],
  );
  assert.equal(result.products[0].market_name, '시장1');
  assert.equal(result.products[0].market_distance, 100);
  assert.equal(result.failedMarketCount, 0);
  assert.ok(peak <= 3);
  mode = 'partial';
  const partial = await api.getClosingSaleProducts(
    location,
    () => true,
    new Date('2026-11-09T08:00:00Z'),
  );
  assert.equal(partial.failedMarketCount, 1);
  assert.ok(partial.products.length > 0);
  mode = 'stuck';
  calls = [];
  const stuck = await api.getClosingSaleProducts(
    location,
    () => true,
    new Date('2026-11-09T08:00:00Z'),
  );
  assert.equal(stuck.failedMarketCount, 4);
  assert.equal(calls.length, 8);
  const count = nearbyCalls;
  await api.getClosingSaleProducts(
    location,
    () => false,
    new Date('2026-11-09T08:00:00Z'),
  );
  assert.equal(nearbyCalls, count);
  console.log(
    'PASS: KST 16:00/midnight boundary, nearby radius, all pages, valid discounts including zero, market metadata, concurrency, partial errors and stale loads',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
