const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/services/api/images.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let mock = false;
let session = {
  access_token: 'merchant',
  role: 'MERCHANT',
  expiresAt: Date.now() + 600000,
};
let upload,
  deletion,
  status = 200;
const result = {
  image_id: 1001,
  listing_id: 101,
  image_url: 'https://example.com/photo.jpg',
  file_name: 'apple.jpg',
  uploaded_at: '2026-11-03T10:00:00',
  message: '업로드 완료',
};
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
class Form {
  constructor() {
    this.parts = [];
  }
  append(...part) {
    this.parts.push(part);
  }
}
const modules = {
  'react-native': { Platform: { OS: 'ios' } },
  './multipart': {
    postMultipart: async (...args) => {
      upload = args;
      return { ok: status < 400, status, json: async () => ({ ...result }) };
    },
  },
  './auth': { getAuthSession: () => session },
  './client': {
    ApiError,
    deleteJson: async (...args) => {
      deletion = args;
      if (status >= 400) throw new ApiError(status, 'server');
      return { image_id: 1001, message: '삭제 완료' };
    },
  },
  '../devMock': { isMockMode: () => mock },
};
const api = {};
new Function('require', 'exports', 'FormData', source)(
  (name) => modules[name],
  api,
  Form,
);
process.env.EXPO_PUBLIC_API_URL = 'http://example.test';
const photo = {
  uri: 'file:///photo.jpg',
  fileName: 'apple.jpg',
  mimeType: 'image/jpeg',
};
(async () => {
  const image = await api.uploadProductImage(photo, 101);
  assert.equal(image.image_id, 1001);
  assert.equal(upload[0], 'http://example.test/images');
  assert.deepEqual(upload[1].parts, [
    ['listing_id', '101'],
    ['image_file', { uri: photo.uri, name: 'apple.jpg', type: 'image/jpeg' }],
  ]);
  assert.deepEqual(upload[2].headers, { Authorization: 'Bearer merchant' });
  assert.equal(image.listing_id, 101);
  assert.equal(image.image_url, result.image_url);
  process.env.EXPO_PUBLIC_API_URL = 'https://example.test/api/';
  result.image_url = '/uploads/images/apple.png';
  assert.equal((await api.uploadProductImage(photo, 101)).image_url,
    'https://example.test/uploads/images/apple.png');
  result.image_url = 'uploads/images/apple.png';
  assert.equal((await api.uploadProductImage(photo, 101)).image_url,
    'https://example.test/uploads/images/apple.png');
  status = 201;
  assert.equal((await api.uploadProductImage(photo, 101)).listing_id, 101);
  result.listing_id = 99;
  await assert.rejects(api.uploadProductImage(photo, 101), /업로드 결과/);
  result.listing_id = 101;
  status = 202;
  await assert.rejects(api.uploadProductImage(photo, 101), /업로드 결과/);
  status = 200;
  const validResponse = { ...result };
  const diagnostics = [];
  const previousLogger = globalThis.__jangbosoLogError;
  globalThis.__jangbosoLogError = (scope, error) => diagnostics.push({ scope, message: error.message });
  for (const [change, code] of [
    [{ image_id: 'private-response' }, 'image_id/invalid'],
    [{ listing_id: null }, 'listing_id/invalid'],
    [{ listing_id: 102 }, 'listing_id/mismatch'],
    [{ uploaded_at: 'private-response' }, 'uploaded_at/invalid'],
    [{ file_name: { private: 'private-response' } }, 'file_name/not_string'],
    [{ message: null }, 'message/not_string'],
    [{ image_url: null }, 'image_url/invalid'],
  ]) {
    Object.assign(result, validResponse, change);
    await assert.rejects(api.uploadProductImage(photo, 101),
      (error) => error.message.includes(`IMAGE_RESPONSE:${code}`));
  }
  assert.equal(JSON.stringify(diagnostics).includes('private-response'), false);
  assert.equal(diagnostics.every((entry) => entry.scope === 'services/api/images.ts'), true);
  globalThis.__jangbosoLogError = previousLogger;
  Object.assign(result, validResponse);
  result.listing_id = null;
  assert.equal((await api.uploadProductImage(photo)).listing_id, null);
  assert.equal(upload[1].parts.length, 1);
  assert.equal(upload[1].parts[0][0], 'image_file');
  result.listing_id = 99;
  await assert.rejects(api.uploadProductImage(photo, 101), /업로드 결과/);
  result.listing_id = '101';
  await assert.rejects(api.uploadProductImage(photo, 101), /업로드 결과/);
  delete result.listing_id;
  await assert.rejects(api.uploadProductImage(photo), /업로드 결과/);
  await assert.rejects(api.uploadProductImage(photo, 0), /상품 ID/);
  assert.equal((await api.deleteProductImage(1001)).image_id, 1001);
  assert.deepEqual(deletion, ['/images/1001', 'merchant', 200]);
  status = 409;
  await assert.rejects(api.deleteProductImage(1001), /삭제할 수 없는/);
  status = 415;
  await assert.rejects(api.uploadProductImage(photo), /지원하지 않는/);
  mock = true;
  const saved = await api.uploadProductImage(photo, 101);
  assert.equal(saved.listing_id, 101);
  assert.equal((await api.uploadProductImage(photo)).listing_id, null);
  assert.equal(
    (await api.deleteProductImage(saved.image_id)).image_id,
    saved.image_id,
  );
  await assert.rejects(api.deleteProductImage(saved.image_id), /찾을 수/);
  session = null;
  await assert.rejects(api.deleteProductImage(1001), /로그인/);
  console.log(
    'PASS: image multipart field/auth, optional listing ID, upload result validation, deletion contract/errors, mock lifecycle and session guard',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
