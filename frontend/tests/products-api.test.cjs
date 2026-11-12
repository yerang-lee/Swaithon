const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  ts = require('typescript');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/services/api/products.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let url, fail;
class ApiError extends Error {
  constructor(status) {
    super('error');
    this.status = status;
  }
}
const product = {
  listing_id: 101,
  product_id: 1,
  store_id: 1,
  store_name: '가게',
  market_id: 1,
  product_name: '사과 1kg',
  category_id: 2,
  category: 'FRUIT',
  category_name: '과일',
  price: 10000,
  sale_price: 8000,
  is_sold_out: false,
  is_on_sale: true,
  image_url: null,
  created_at: '2026-11-03T10:00:00+09:00',
};
let payload = { products: [product], total_count: 21, page: 2, size: 10 };
const get = async (p) => {
  url = p;
  if (fail) throw fail;
  return payload;
};
const api = {};
const imageUrls = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../src/utils/imageUrl.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(imageUrls);
new Function('require', 'exports', source)(
  (name) =>
    name === '../../utils/imageUrl' ? imageUrls :
    name === './client' ? { ApiError, getJson: get } : {},
  api,
);
(async () => {
  const result = await api.getProducts({
    market_id: 1,
    category_id: 2,
    keyword: ' 사과 & 배 ',
    page: 2,
    is_sold_out: false,
    is_on_sale: true,
  });
  assert.equal(result.products[0].image_url, null);
  const requestedUrl = url;
  process.env.EXPO_PUBLIC_API_URL = 'https://api.test/api';
  payload = { ...payload, products: [{ ...product, image_url: '/uploads/images/apple.jpg' }] };
  assert.equal((await api.getProducts({ page: 2 })).products[0].image_url,
    'https://api.test/uploads/images/apple.jpg');
  assert.equal(result.products[0].sale_price, 8000);
  const query = new URL(requestedUrl, 'https://test.invalid').searchParams;
  assert.equal(query.get('keyword'), '사과 & 배');
  assert.equal(query.get('market_id'), '1');
  assert.equal(query.get('category_id'), '2');
  assert.equal(query.get('is_sold_out'), 'false');
  assert.equal(query.get('is_on_sale'), 'true');
  assert.equal(query.get('page'), '2');
  await assert.rejects(() => api.getProducts({ category_id: 'FRUIT' }));
  payload = { ...payload, products: [{ ...product, market_id: 2 }] };
  await assert.rejects(
    () => api.getProducts({ market_id: 1, page: 2 }),
    /응답/,
  );
  payload = {
    products: [{ ...product, is_on_sale: null }],
    total_count: 1,
    page: 1,
    size: 10,
  };
  assert.equal((await api.getProducts()).products[0].is_on_sale, null);
  await assert.rejects(() => api.getProducts({ is_on_sale: true }), /응답/);
  await assert.rejects(() => api.getProducts({ is_on_sale: false }), /응답/);
  for (const invalid of [undefined, 'true', 0]) {
    payload = { ...payload, products: [{ ...product, is_on_sale: invalid }] };
    await assert.rejects(() => api.getProducts(), /응답/);
  }
  for (const value of [true, false]) {
    payload = { ...payload, products: [{ ...product, is_on_sale: value }] };
    assert.equal(
      (await api.getProducts({ is_on_sale: value })).products[0].is_on_sale,
      value,
    );
  }
  await assert.rejects(() => api.getProducts({ is_on_sale: null }), /필터/);
  for (const sale_price of [null, 0, 8000]) {
    payload = {
      products: [{ ...product, sale_price }],
      total_count: 1,
      page: 1,
      size: 10,
    };
    assert.equal((await api.getProducts()).products[0].sale_price, sale_price);
  }
  for (const sale_price of [undefined, '8000', -1]) {
    payload = { ...payload, products: [{ ...product, sale_price }] };
    await assert.rejects(() => api.getProducts(), /응답/);
  }
  payload = {
    products: [{ ...product, sale_price: undefined, discount_price: 8000 }],
    total_count: 1,
    page: 1,
    size: 10,
  };
  await assert.rejects(() => api.getProducts(), /응답/);
  const detail = {
    listing_id: 101,
    product_id: 1,
    product_name: '사과 1kg',
    category_id: null,
    description: null,
    image_url: null,
    price: 10000,
    sale_price: 8000,
    is_sold_out: false,
    store_id: 1,
    store_name: '가게',
    market_id: 1,
    market_name: '시장',
  };
  payload = detail;
  assert.deepEqual(await api.getProduct('101'), detail);
  payload = { ...detail, image_url: '/uploads/images/apple.jpg' };
  assert.equal((await api.getProduct('101')).image_url,
    'https://api.test/uploads/images/apple.jpg');
  for (const change of [
    { description: '' },
    { image_url: 'https://example.com/apple.jpg' },
    { category_id: 2 },
    { sale_price: 0 },
    { sale_price: null },
  ]) {
    payload = { ...detail, ...change };
    assert.deepEqual(await api.getProduct('101'), payload);
  }
  for (const change of [
    { listing_id: '101' },
    { listing_id: 102 },
    { category_id: undefined },
    { description: undefined },
    { image_url: undefined },
    { market_name: undefined },
    { price: -1 },
  ]) {
    payload = { ...detail, ...change };
    await assert.rejects(() => api.getProduct('101'), /응답/);
  }
  await assert.rejects(() => api.getProduct('listing_101'), /ID/);
  payload = { products: [], total_count: 0, page: 1, size: 10 };
  assert.equal((await api.getProducts({ market_id: 1 })).total_count, 0);
  fail = new ApiError(400);
  await assert.rejects(() => api.getProducts(), /카테고리/);
  console.log(
    'PASS: market/category/keyword/boolean pagination queries, null image and sale status, missing/invalid status rejected, strict sale filters, market isolation, backend detail integer IDs/nulls/absent legacy fields, empty results, 400',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
