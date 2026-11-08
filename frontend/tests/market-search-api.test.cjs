const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const code = ts.transpileModule(
  fs.readFileSync(path.join(root, 'src/services/api/markets.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let requested,
  failure,
  payload = {
    total_count: 67,
    is_end: false,
    documents: [
      {
        place_id: '123456789',
        market_id: 1,
        market_name: '망원시장',
        address: '서울 마포구',
        latitude: 37.5563,
        longitude: 126.9102,
        category_name: '가정,생활 > 시장',
        place_url: 'https://place.map.kakao.com/123456789',
      },
    ],
  };
class ApiError extends Error {
  constructor(status) {
    super('error');
    this.status = status;
  }
}
const api = {};
new Function('require', 'exports', code)(
  () => ({
    ApiError,
    getJson: async (url) => {
      requested = url;
      if (failure) throw failure;
      return payload;
    },
  }),
  api,
);
(async () => {
  const result = await api.searchKakaoMarkets(' 망원시장 & 과일 ');
  assert.equal(
    new URL(requested, 'https://test.invalid').searchParams.get('query'),
    '망원시장 & 과일',
  );
  assert.ok(requested.startsWith('/markets/search/kakao?'));
  assert.equal(result.documents[0].place_id, '123456789');
  assert.equal(result.documents[0].market_id, 1);
  assert.equal(result.is_end, false);
  payload = {
    ...payload,
    documents: [{ ...payload.documents[0], market_id: 7 }],
  };
  assert.equal(
    (await api.searchKakaoMarkets('시장')).documents[0].market_id,
    7,
  );
  payload = {
    ...payload,
    documents: [{ ...payload.documents[0], market_id: null }],
  };
  assert.equal(
    (await api.searchKakaoMarkets('시장')).documents[0].market_id,
    null,
  );
  payload = {
    ...payload,
    documents: [{ ...payload.documents[0], market_id: -1 }],
  };
  await assert.rejects(() => api.searchKakaoMarkets('시장'), /검색 응답/);
  for (const invalid of [undefined, 0, -1, 1.5, '7']) {
    payload = {
      ...payload,
      documents: [{ ...payload.documents[0], market_id: invalid }],
    };
    await assert.rejects(() => api.searchKakaoMarkets('시장'), /검색 응답/);
  }
  payload = {
    ...payload,
    documents: [
      { ...payload.documents[0], market_id: 7 },
      { ...payload.documents[0], place_id: '987654321', market_id: null },
    ],
  };
  const sameName = await api.searchKakaoMarkets('시장');
  assert.equal(
    sameName.documents[0].market_name,
    sameName.documents[1].market_name,
  );
  assert.equal(sameName.documents[0].market_id, 7);
  assert.equal(sameName.documents[1].market_id, null);
  const previous = requested;
  await assert.rejects(() => api.searchKakaoMarkets('   '));
  assert.equal(previous, requested);
  failure = new ApiError(502);
  await assert.rejects(
    () => api.searchKakaoMarkets('시장'),
    /카카오 시장 검색/,
  );
  failure = undefined;
  payload = {
    ...payload,
    documents: [{ ...payload.documents[0], latitude: 100 }],
  };
  await assert.rejects(() => api.searchKakaoMarkets('시장'), /검색 응답/);
  payload = { total_count: 0, is_end: true, documents: [] };
  assert.deepEqual((await api.searchKakaoMarkets('없는시장')).documents, []);
  console.log(
    'PASS: keyword encoding, required nullable internal IDs, same-name places, empty input, 502, invalid coordinates, empty results, is_end',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
