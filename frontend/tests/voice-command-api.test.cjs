const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/services/api/voiceCommands.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let mock = false,
  session = {
    access_token: 'real-test-token',
    role: 'MERCHANT',
    expiresAt: Date.now() + 600000,
  };
let response,
  status = 200,
  network = false;
const calls = [];
const environment = {
  env: {
    EXPO_PUBLIC_VOICE_COMMAND_API: 'true',
    EXPO_PUBLIC_API_URL: 'https://backend.invalid',
  },
};
const api = {},
  platform = { OS: 'ios' };
let fileSize = 4;
const audioBytes = new Uint8Array([1, 2, 3, 4]);
class File {
  constructor(uri) {
    this.uri = uri;
    return new Proxy(this, {
      has: (target, key) =>
        key === 'bytes' ? false : Reflect.has(target, key),
    });
  }
  get size() {
    return fileSize;
  }
  get name() {
    return this.uri.split('/').pop();
  }
  get type() {
    return 'audio/mp4';
  }
  async bytes() {
    return audioBytes;
  }
}
class FormData {
  constructor() {
    this._parts = [];
  }
  get fields() {
    return this._parts;
  }
}
const formPatch = {};
const formPatchSource = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../node_modules/expo/src/winter/FormData.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
new Function('exports', formPatchSource)(formPatch);
formPatch.installFormDataPatch(FormData);
const converter = {};
const converterSource = ts.transpileModule(
  fs.readFileSync(
    path.join(
      __dirname,
      '../node_modules/expo/src/winter/fetch/convertFormData.ts',
    ),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
new Function('require', 'exports', converterSource)(
  () => ({ blobToArrayBufferAsync: (blob) => blob.arrayBuffer() }),
  converter,
);
const transport = async (url, options) => {
  calls.push({ url, ...options });
  if (network) throw new TypeError('offline');
  return { ok: status < 400, status, json: async () => response };
};
new Function('require', 'exports', 'fetch', 'FormData', 'process', source)(
  (name) =>
    name === './multipart'
      ? {
          postMultipart: (url, body, options) =>
            transport(url, { method: 'POST', body, ...options }),
        }
      : name === 'expo-file-system'
        ? { File }
        : name === 'react-native'
          ? { Platform: platform }
          : name === './auth'
            ? { getAuthSession: () => session }
            : { isMockMode: () => mock },
  api,
  transport,
  FormData,
  environment,
);
const state = (status, extra = {}) => ({
  command_id: 'cmd-1',
  status,
  intent: 'PRODUCT_UPDATE',
  message: '질문',
  transcript: '사과',
  execution_endpoint:
    status === 'NEEDS_CONFIRMATION' ? '/voice/product-update' : null,
  ...(status === 'NEEDS_CONFIRMATION'
    ? { preview: { before: { price: 5000 }, after: { price: 6000 } } }
    : {}),
  ...extra,
});
async function main() {
  response = state('NEEDS_INPUT');
  const initial = await api.analyzeText('사과 가격 바꿔');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { text: '사과 가격 바꿔' });
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer real-test-token');
  response = state('NEEDS_INPUT');
  const next = await api.answerText(initial, '6천 원');
  assert.ok(calls.at(-1).url.includes('/commands/cmd-1/answer'));
  assert.deepEqual(JSON.parse(calls.at(-1).body), { text: '6천 원' });
  assert.equal(next.expiresAt, initial.expiresAt);
  response = state('NEEDS_CONFIRMATION', {
    parsed: { intent: 'PRODUCT_CREATE' },
    preview: { before: { price: 5000 }, after: { price: 6000 } },
  });
  const confirmed = await api.answerAudio(next, {
    uri: 'file:///voice.m4a',
    durationMillis: 1000,
    fileSize: 1024,
  });
  assert.ok(calls.at(-1).url.endsWith('/commands/cmd-1/answer-audio'));
  assert.equal(calls.at(-1).body.fields[0][0], 'file');
  assert.equal(calls.at(-1).headers['Content-Type'], undefined);
  assert.equal(confirmed.intent, 'PRODUCT_UPDATE');
  assert.equal(confirmed.expiresAt, initial.expiresAt);
  const multipart = calls.at(-1).body;
  assert.deepEqual(multipart.fields[0][1], {
    uri: 'file:///voice.m4a',
    name: 'voice.m4a',
    type: 'audio/mp4',
  });
  const unsupported = new FormData();
  unsupported.append('file', {
    uri: 'file:///old.m4a',
    name: 'voice.m4a',
    type: 'audio/mp4',
  });
  await assert.rejects(
    () => converter.convertFormDataAsync(unsupported),
    /Unsupported FormDataPart/,
  );
  response = state('NEEDS_INPUT');
  await api.analyzeAudio({
    uri: 'file:///voice.m4a',
    durationMillis: 1000,
    fileSize: 1024,
  });
  assert.ok(calls.at(-1).url.endsWith('/voice/product-registration'));
  assert.equal(calls.at(-1).body.fields[0][0], 'audio_file');
  assert.equal(calls.at(-1).body.fields[0][1].uri, 'file:///voice.m4a');
  for (const invalidSize of [0, 11 * 1024 * 1024]) {
    fileSize = invalidSize;
    await assert.rejects(
      () =>
        api.analyzeAudio({
          uri: 'file:///voice.m4a',
          durationMillis: 1000,
          fileSize: 1024,
        }),
      /10MB/,
    );
  }
  fileSize = 4;
  network = true;
  await assert.rejects(
    () => api.executeCommand(confirmed),
    (e) => e.code === 'NETWORK',
  );
  const failed = calls.at(-1);
  network = false;
  response = state('SUCCEEDED', { result: { price: 6000 } });
  const done = await api.executeCommand(confirmed, true);
  assert.equal(done.status, 'SUCCEEDED');
  assert.equal(calls.at(-1).url, failed.url);
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    command_id: 'cmd-1',
    confirmed: true,
  });
  assert.throws(() =>
    api.parseCommand(
      state('NEEDS_CONFIRMATION', {
        execution_endpoint: 'https://evil.invalid/voice/product-delete',
      }),
    ),
  );
  assert.equal(api.parseCommand(
    state('NEEDS_INPUT', { execution_endpoint: '/voice/product-update' }),
  ).execution_endpoint, null, 'clarification must never expose an execution endpoint');
  assert.throws(() =>
    api.parseCommand(state('NEEDS_INPUT', { command_id: 'other' }), 'cmd-1'),
  );
  await assert.rejects(() => api.executeCommand(initial));
  const selection = api.parseCommand(
    state('NEEDS_SELECTION', {
      candidates: [
        {
          listing_id: 'listing-2',
          product_name: '사과',
          sale_quantity: 3,
          sale_unit: '개',
          price: 5000,
        },
      ],
    }),
  );
  response = state('NEEDS_CONFIRMATION');
  await api.selectCandidate(selection, 'listing-2');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { listing_id: 'listing-2' });
  await assert.rejects(() => api.selectCandidate(selection, 'first-guess'));
  response = state('CANCELLED');
  response.parsed = { intent: 'SALE_CREATE', product_name: '복숭아', price: null, sale_price: 2000 };
  response.preview = {
    before: { price: 4000, effective_price: 4000 },
    after: { price: 4000, effective_price: 2000, sale_active: true },
  };
  const cancelledCommand = await api.cancelCommand(selection);
  assert.equal(cancelledCommand.status, 'CANCELLED');
  assert.equal(cancelledCommand.analysis_result, undefined);
  assert.deepEqual(cancelledCommand.preview, { before: null, after: null });
  assert.equal(cancelledCommand.result, null);
  assert.equal(cancelledCommand.needs_confirmation, false);
  assert.ok(calls.at(-1).url.endsWith('/commands/cmd-1/cancel'));
  assert.equal(calls.at(-1).body, undefined);
  status = 503;
  response = {
    detail: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'private connection credentials',
    },
  };
  await assert.rejects(
    () => api.analyzeText('사과'),
    (e) => !e.message.includes('credentials') && e.status === 503,
  );
  status = 200;
  assert.throws(() =>
    api.checkAudio({
      uri: 'file:///a.m4a',
      durationMillis: 30001,
      fileSize: 10,
    }),
  );
  assert.throws(() =>
    api.checkAudio({ uri: 'file:///a.m4a', durationMillis: 10, fileSize: 0 }),
  );
  assert.throws(() =>
    api.checkAudio({
      uri: 'file:///a.m4a',
      durationMillis: 10,
      fileSize: 11 * 1024 * 1024,
    }),
  );
  for (const times of [
    {},
    { starts_at: null, ends_at: null },
    { starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-30T00:00:00Z' },
  ]) {
    const snapshot = {
      product_name: '사과',
      price: 5000,
      effective_price: 4000,
      sale_active: true,
      ...times,
    };
    response = state('NEEDS_CONFIRMATION', {
      intent: 'SALE_CREATE',
      execution_endpoint: '/voice/sale-registration',
      preview: { before: null, after: snapshot },
    });
    const unchanged = JSON.stringify(response);
    const discount = await api.analyzeText('사과 할인해 줘');
    assert.equal(discount.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(discount.preview.after, snapshot);
    assert.equal(JSON.stringify(response), unchanged);
    response = state('SUCCEEDED', {
      intent: 'SALE_CREATE',
      result: { ...snapshot },
    });
    const saved = await api.executeCommand(discount);
    assert.ok(calls.at(-1).url.endsWith('/voice/sale-registration'));
    assert.deepEqual(JSON.parse(calls.at(-1).body), {
      command_id: 'cmd-1',
      confirmed: true,
    });
    assert.deepEqual(saved.result, snapshot);
    assert.deepEqual(discount.preview.after, snapshot);
  }
  response = state('NEEDS_CONFIRMATION', {
    intent: 'SALE_DELETE',
    execution_endpoint: '/voice/sale-delete',
    preview: { before: { is_on_sale: true }, after: { is_on_sale: false } },
  });
  const saleDeleteCommand = await api.analyzeText('사과 할인 종료');
  response = state('SUCCEEDED', {
    intent: 'SALE_DELETE',
    result: { is_on_sale: false },
  });
  await api.executeCommand(saleDeleteCommand);
  assert.ok(calls.at(-1).url.endsWith('/voice/sale-delete'));
  assert.equal(calls.at(-1).headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    command_id: saleDeleteCommand.command_id,
    confirmed: true,
  });
  const deadline = new Date(Date.now() + 15 * 60000).toISOString();
  response = {
    command_id: 'modern-command',
    intent: 'PRODUCT_CREATE',
    status: 'NEEDS_INPUT',
    transcript: '사과 등록해 줘.',
    analysis_result: {
      product_name: '사과',
      price: null,
      unit: null,
      category: 'FRUIT',
      category_name: '과일',
    },
    missing_fields: ['price', 'unit'],
    needs_confirmation: false,
    question: '가격과 판매 단위를 알려주세요.',
    expires_at: deadline,
    message: '추가 입력 필요',
  };
  const modernInitial = await api.analyzeAudio({
    uri: 'file:///voice.m4a',
    durationMillis: 1000,
    fileSize: 4,
  });
  assert.deepEqual(
    calls.at(-1).body.fields.map(([key]) => key),
    ['audio_file'],
  );
  assert.equal(modernInitial.question, response.question);
  assert.equal(modernInitial.expiresAt, Date.parse(deadline));
  // Actual audio endpoint shape: optional question is explicitly null.
  const originalModernResponse = response;
  const audioReadyResponse = {
    ...response,
    command_id: 'audio-null-question',
    status: 'READY',
    missing_fields: [],
    needs_confirmation: true,
    question: null,
    execution_endpoint: '/voice/product-registration/confirm',
    candidates: [],
    preview: { before: null, after: { product_name: '사과', price: 5000 } },
  };
  response = audioReadyResponse;
  const readyWithNullQuestion = await api.analyzeAudio({
    uri: 'file:///voice.m4a', durationMillis: 1000, fileSize: 4,
  });
  assert.equal(readyWithNullQuestion.status, 'READY');
  assert.equal(readyWithNullQuestion.question, undefined);
  assert.deepEqual(readyWithNullQuestion.preview, response.preview);
  // Intent/target clarification can require an answer without a missing field.
  for (const [intent, question] of [
    ['UNKNOWN', '어떤 상품을 어떻게 처리할지 말씀해 주세요.'],
    ['MULTIPLE', '한 상품씩 한 작업을 말씀해 주세요.'],
    ['PRODUCT_DELETE', '상품명과 판매 단위를 확인해 주세요.'],
  ]) {
    response = {
      ...audioReadyResponse, command_id: `clarify-${intent}`, intent,
      status: 'NEEDS_INPUT', missing_fields: [], needs_confirmation: false,
      question, execution_endpoint: null, preview: null,
      analysis_result: { intent },
    };
    const clarification = await api.analyzeAudio({
      uri: 'file:///voice.m4a', durationMillis: 1000, fileSize: 4,
    });
    assert.equal(clarification.status, 'NEEDS_INPUT');
    assert.equal(clarification.question, question);
    assert.deepEqual(clarification.missing_fields, []);
    const beforeExecution = calls.length;
    await assert.rejects(api.executeCommand(clarification));
    assert.equal(calls.length, beforeExecution);
    for (const invalid of [
      { question: null }, { question: '' }, { question: ' ' },
      { needs_confirmation: true }, { missing_fields: null },
      { missing_fields: ['price', 1] },
    ]) {
      const recovered = api.parseCommand({ ...response, ...invalid });
      assert.equal(recovered.status, 'NEEDS_INPUT');
      assert.ok(recovered.question.trim());
      assert.equal(recovered.needs_confirmation, false);
      assert.equal(recovered.execution_endpoint, null);
    }
  }
  for (const question of [null, undefined, '', ' ', 42]) {
    const recovered = api.parseCommand({
      ...audioReadyResponse, status: 'NEEDS_INPUT',
      missing_fields: ['price'], needs_confirmation: false,
      execution_endpoint: null, question,
    });
    assert.equal(recovered.status, 'NEEDS_INPUT');
    assert.ok(recovered.question.trim());
  }
  assert.throws(() => api.parseCommand({
    ...audioReadyResponse, question: 42,
  }), /음성 분석 결과와 추가 질문/);
  const audioSelection = api.parseCommand({
    ...audioReadyResponse, status: 'NEEDS_SELECTION',
    needs_confirmation: false, execution_endpoint: null,
    candidates: [{ listing_id: 'listing-1', product_name: '사과' }],
  });
  assert.equal(audioSelection.candidates[0].listing_id, 'listing-1');
  assert.throws(() => api.parseCommand({
    ...audioReadyResponse, status: 'NEEDS_SELECTION',
    needs_confirmation: false, execution_endpoint: null, candidates: [],
  }), /후보/);
  response = originalModernResponse;
  const modernResponse = response;
  response = {
    analysis_id: '2ae36978-02d7-4552-a542-57b356fc5021',
    intent: 'PRODUCT_CREATE',
    status: 'READY',
    transcript: '사과 10개 5천원',
    product_name: '사과',
    price: 5000,
    unit: '10 개',
    category: 'FRUIT',
    category_name: '과일',
    missing_fields: [],
    needs_confirmation: true,
    expires_at: deadline,
    message: '상품 등록 정보를 분석했습니다. 확인 후 등록해 주세요.',
  };
  const wrapperReadyResponse = response;
  const wrapperCount = calls.length;
  const wrapperReady = await api.analyzeAudio({
    uri: 'file:///voice.m4a',
    durationMillis: 1000,
    fileSize: 4,
  });
  assert.equal(
    calls.length,
    wrapperCount + 1,
    'analysis does not confirm automatically',
  );
  assert.equal(wrapperReady.command_id, wrapperReadyResponse.analysis_id);
  assert.equal(wrapperReady.status, 'READY');
  assert.equal(wrapperReady.analysis_result.product_name, '사과');
  assert.equal(wrapperReady.analysis_result.price, 5000);
  assert.equal(wrapperReady.analysis_result.unit, '10 개');
  assert.equal(
    wrapperReady.execution_endpoint,
    '/voice/product-registration/confirm',
  );
  response = {
    ...wrapperReadyResponse,
    analysis_id: 'wrapped-needs-input',
    status: 'NEEDS_INPUT',
    needs_confirmation: false,
    unit: null,
    missing_fields: ['sale_quantity', 'sale_unit'],
    message: '몇 개인지도 알려주세요. 판매 단위도 알려주세요.',
  };
  const wrapperWaiting = await api.analyzeAudio({
    uri: 'file:///voice.m4a',
    durationMillis: 1000,
    fileSize: 4,
  });
  assert.equal(wrapperWaiting.command_id, 'wrapped-needs-input');
  assert.equal(wrapperWaiting.question, response.message);
  assert.equal(wrapperWaiting.execution_endpoint, null);
  const beforeWrappedConfirm = calls.length;
  await assert.rejects(api.executeCommand(wrapperWaiting));
  assert.equal(calls.length, beforeWrappedConfirm);
  await assert.rejects(
    api.answerText(wrapperWaiting, 'x'.repeat(2001)),
    /2,000자/,
  );
  response = {
    command_id: wrapperWaiting.command_id,
    intent: 'PRODUCT_CREATE',
    status: 'NEEDS_CONFIRMATION',
    parsed: {
      intent: 'PRODUCT_CREATE',
      product_name: '사과',
      price: 5000,
      sale_quantity: 3,
      sale_unit: '개',
    },
    missing_fields: [],
    preview: null,
    execution_endpoint: '/voice/product-registration/confirm',
    expires_at: deadline,
    message: '확인해주세요.',
  };
  const wrapperAnswered = await api.answerText(wrapperWaiting, '세 개예요');
  assert.ok(calls.at(-1).url.endsWith('/commands/wrapped-needs-input/answer'));
  assert.deepEqual(JSON.parse(calls.at(-1).body), { text: '세 개예요' });
  assert.equal(wrapperAnswered.command_id, wrapperWaiting.command_id);
  assert.equal(wrapperAnswered.status, 'NEEDS_CONFIRMATION');
  response = {
    command_id: wrapperReady.command_id,
    intent: 'PRODUCT_CREATE',
    status: 'SUCCEEDED',
    result: {
      product_id: 2,
      product_name: '사과',
      effective_price: 5000,
      sale_active: false,
    },
    message: '완료',
  };
  assert.equal((await api.executeCommand(wrapperReady)).status, 'SUCCEEDED');
  assert.ok(calls.at(-1).url.endsWith('/voice/product-registration/confirm'));
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    command_id: wrapperReadyResponse.analysis_id,
    confirmed: true,
  });
  response = { ...wrapperReadyResponse, command_id: 'different-id' };
  await assert.rejects(
    api.analyzeAudio({
      uri: 'file:///voice.m4a',
      durationMillis: 1000,
      fileSize: 4,
    }),
    /식별자/,
  );
  response = {
    command_id: 'engine-command',
    intent: 'PRODUCT_CREATE',
    status: 'NEEDS_INPUT',
    messages: ['사과세계 천원'],
    parsed: {
      intent: 'PRODUCT_CREATE',
      product_name: '사과',
      price: 1000,
      sale_quantity: null,
      sale_unit: null,
      category: 'FRUIT',
      sale_ends_at: null,
    },
    missing_fields: ['sale_quantity', 'sale_unit'],
    candidates: [],
    preview: null,
    expires_at: deadline,
    execution_endpoint: null,
    message: '몇 개인지도 알려주세요. 판매 단위도 알려주세요.',
  };
  const engineWaiting = await api.analyzeAudio({
    uri: 'file:///voice.m4a',
    durationMillis: 1000,
    fileSize: 4,
  });
  assert.equal(engineWaiting.command_id, 'engine-command');
  assert.equal(engineWaiting.status, 'NEEDS_INPUT');
  assert.equal(engineWaiting.question, response.message);
  assert.equal(engineWaiting.transcript, '사과세계 천원');
  assert.equal(engineWaiting.analysis_result.price, 1000);
  assert.equal(engineWaiting.needs_confirmation, false);
  const engineRaw = response;
  response = {
    ...engineRaw,
    status: 'READY',
    parsed: { ...engineRaw.parsed, sale_quantity: 3, sale_unit: '개' },
    missing_fields: [],
    execution_endpoint: '/voice/product-registration',
  };
  const engineReady = await api.answerText(engineWaiting, '3개예요');
  assert.ok(calls.at(-1).url.endsWith('/commands/engine-command/answer'));
  assert.equal(engineReady.command_id, 'engine-command');
  assert.equal(engineReady.analysis_result.sale_quantity, 3);
  assert.equal(engineReady.needs_confirmation, true);
  assert.equal(engineReady.preview.after.sale_unit, '개');
  assert.equal(engineReady.analysis_result.sale_ends_at, null);
  const previewCommand = api.parseCommand(
    {
      ...response,
      status: 'NEEDS_CONFIRMATION',
      execution_endpoint: '/voice/product-registration/confirm',
    },
    engineWaiting.command_id,
  );
  assert.equal(previewCommand.status, 'NEEDS_CONFIRMATION');
  assert.equal(
    previewCommand.execution_endpoint,
    '/voice/product-registration/confirm',
  );

  response = { ...response, analysis_id: 'legacy-id' };
  await assert.rejects(
    api.analyzeAudio({
      uri: 'file:///voice.m4a',
      durationMillis: 1000,
      fileSize: 4,
    }),
    /식별자/,
  );
  response = modernResponse;

  response = {
    command_id: 'modern-command',
    intent: 'PRODUCT_CREATE',
    status: 'READY',
    transcript: '한 봉지에 만 원이에요.',
    analysis_result: {
      product_name: '사과',
      price: 10000,
      unit: '한 봉지',
      category: 'FRUIT',
      category_name: '과일',
    },
    missing_fields: [],
    needs_confirmation: true,
    message: '추가 정보 반영 완료',
  };
  const beforeModernAnswer = calls.length;
  const modernReady = await api.answerText(
    modernInitial,
    '한 봉지에 만 원이에요.',
  );
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    text: '한 봉지에 만 원이에요.',
  });
  assert.equal(calls.length, beforeModernAnswer + 1);
  assert.equal(modernReady.status, 'READY');
  assert.equal(
    modernReady.execution_endpoint,
    '/voice/product-registration/confirm',
  );
  assert.equal(modernReady.analysis_result.price, 10000);
  assert.equal(modernReady.expiresAt, modernInitial.expiresAt);
  const countBeforeExecute = calls.length;
  await assert.rejects(() =>
    api.executeCommand({ ...modernReady, status: 'NEEDS_INPUT' }),
  );
  await assert.rejects(() =>
    api.executeCommand({ ...modernReady, status: 'NEEDS_SELECTION' }),
  );
  await assert.rejects(() =>
    api.executeCommand({ ...modernReady, missing_fields: ['sale_unit'] }),
  );
  assert.equal(calls.length, countBeforeExecute);
  const audioReady = await api.answerAudio(modernInitial, {
    uri: 'file:///voice.m4a',
    durationMillis: 1000,
    fileSize: 4,
  });
  assert.equal(audioReady.command_id, modernInitial.command_id);
  assert.equal(audioReady.expiresAt, modernInitial.expiresAt);
  assert.deepEqual(
    calls.at(-1).body.fields.map(([key]) => key),
    ['file'],
  );
  for (const change of [
    { needs_confirmation: false },
    { missing_fields: ['price'] },
    { analysis_result: null },
    { command_id: 'wrong-command' },
  ]) {
    assert.throws(() =>
      api.parseCommand({ ...response, ...change }, modernInitial.command_id),
    );
  }
  response = { ...response, execution_endpoint: '/voice/product-registration' };
  const serverExecutable = api.parseCommand(response, modernInitial.command_id);
  response = state('SUCCEEDED', {
    command_id: 'modern-command',
    intent: 'PRODUCT_CREATE',
    result: { product_id: 1 },
  });
  await api.executeCommand(serverExecutable);
  assert.ok(calls.at(-1).url.endsWith('/voice/product-registration/confirm'));
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    command_id: 'modern-command',
    confirmed: true,
  });
  for (const failureStatus of [400, 401, 403, 404, 409, 410, 413, 422, 500]) {
    status = failureStatus;
    response = { detail: 'private audio content' };
    const beforeFailure = calls.length;
    await assert.rejects(
      () =>
        api.answerAudio(modernInitial, {
          uri: 'file:///voice.m4a',
          durationMillis: 1000,
          fileSize: 4,
        }),
      (error) =>
        error.status === failureStatus && !error.message.includes('private'),
    );
    assert.equal(calls.length, beforeFailure + 1);
  }
  status = 200;
  response = state('SUCCEEDED', { result: { product_id: 1 } });
  await assert.rejects(
    () =>
      api.analyzeAudio({
        uri: 'file:///voice.m4a',
        durationMillis: 1000,
        fileSize: 4,
      }),
    /분석 응답/,
  );
  const textAnalysisResponse = {
    command_id: 'text-command',
    intent: 'PRODUCT_CREATE',
    status: 'READY',
    transcript: '사과 한 봉지에 만 원으로 등록해 줘.',
    analysis_result: {
      product_name: '사과',
      price: 10000,
      unit: '한 봉지',
      category: 'FRUIT',
      category_name: '과일',
    },
    missing_fields: [],
    needs_confirmation: true,
    expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
    message: '분석 완료',
  };
  response = textAnalysisResponse;
  const beforeText = calls.length;
  const readyText = await api.analyzeText(
    ' 사과 한 봉지에 만 원으로 등록해 줘. ',
  );
  assert.equal(calls.length, beforeText + 1);
  assert.ok(calls.at(-1).url.endsWith('/voice/analyze'));
  assert.equal(calls.at(-1).headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    text: '사과 한 봉지에 만 원으로 등록해 줘.',
  });
  assert.equal(readyText.status, 'READY');
  assert.equal(
    readyText.execution_endpoint,
    '/voice/product-registration/confirm',
  );
  assert.deepEqual(
    readyText.analysis_result,
    textAnalysisResponse.analysis_result,
  );
  response = {
    ...textAnalysisResponse,
    command_id: 'text-needs-input',
    status: 'NEEDS_INPUT',
    analysis_result: {
      product_name: '사과',
      price: null,
      unit: null,
      category: 'FRUIT',
      category_name: '과일',
    },
    missing_fields: ['price', 'unit'],
    needs_confirmation: false,
    question: '가격과 단위를 알려주세요.',
  };
  const needsText = await api.analyzeText('사과 등록해 줘.');
  assert.equal(needsText.question, '가격과 단위를 알려주세요.');
  assert.deepEqual(needsText.missing_fields, ['price', 'unit']);
  response = {
    ...textAnalysisResponse,
    command_id: 'text-sale-update',
    intent: 'SALE_UPDATE',
    analysis_result: { product_id: 1, discount_price: 8000 },
  };
  assert.equal(
    (await api.analyzeText('사과 할인가 수정')).intent,
    'SALE_UPDATE',
  );
  response = { ...response, execution_endpoint: '/voice/sale-update' };
  await assert.rejects(() => api.analyzeText('사과 할인가 수정'), /실행 경로/);
  response = state('SUCCEEDED', { result: { product_id: 1 } });
  await assert.rejects(() => api.analyzeText('사과 등록'), /분석 응답/);
  for (const code of [400, 401, 403, 422, 500]) {
    status = code;
    response = { detail: 'private input' };
    await assert.rejects(
      () => api.analyzeText('사과 등록'),
      (error) => error.status === code && !error.message.includes('private'),
    );
  }
  status = 200;
  const beforeEmptyText = calls.length;
  await assert.rejects(() => api.analyzeText('   '));
  assert.equal(calls.length, beforeEmptyText);
  const diagnostics = [];
  const previousLogger = globalThis.__jangbosoLogError;
  globalThis.__jangbosoLogError = (scope, error) =>
    diagnostics.push({ scope, code: error.code, message: error.message });
  status = 422;
  response = {
    detail: [
      {
        loc: ['body', 'file'],
        type: 'missing',
        msg: 'private validation message',
        input: { transcript: 'private speech' },
      },
    ],
  };
  await assert.rejects(
    () =>
      api.analyzeAudio({
        uri: 'file:///voice.m4a',
        durationMillis: 1000,
        fileSize: 4,
      }),
    (error) =>
      error.code === 'VALIDATION:file/missing' &&
      error.message.includes('누락'),
  );
  assert.ok(
    diagnostics.at(-1).scope.endsWith('POST /voice/product-registration'),
  );
  response = { detail: '음성을 확인하지 못했습니다. 다시 녹음해 주세요.' };
  await assert.rejects(
    () =>
      api.analyzeAudio({
        uri: 'file:///voice.m4a',
        durationMillis: 1000,
        fileSize: 4,
      }),
    (error) => error.code === 'STT_NO_SPEECH',
  );
  response = {
    detail: [
      {
        loc: ['body', 'private input key'],
        type: 'private type',
        msg: 'private msg',
        input: 'private text',
      },
    ],
  };
  await assert.rejects(
    () =>
      api.analyzeAudio({
        uri: 'file:///voice.m4a',
        durationMillis: 1000,
        fileSize: 4,
      }),
    (error) => error.code === 'VALIDATION:request/invalid',
  );
  response = { detail: { code: 'private code', message: 'private content' } };
  await assert.rejects(
    () =>
      api.analyzeAudio({
        uri: 'file:///voice.m4a',
        durationMillis: 1000,
        fileSize: 4,
      }),
    (error) => error.code === 'UNCLASSIFIED_422',
  );
  assert.equal(JSON.stringify(diagnostics).includes('private'), false);
  assert.equal(JSON.stringify(diagnostics).includes('file:///'), false);
  globalThis.__jangbosoLogError = previousLogger;
  status = 200;
  mock = false;
  environment.env.EXPO_PUBLIC_VOICE_COMMAND_API = 'false';
  response = state('NEEDS_INPUT');
  await api.analyzeText('사과');
  assert.ok(calls.at(-1).url.endsWith('/voice/analyze'));
  session = { ...session, role: 'CUSTOMER' };
  await assert.rejects(
    () => api.analyzeText('사과'),
    (e) => e.status === 403,
  );
  console.log(
    'PASS: initial/follow-up IDs, file field/MIME, selection, server execution allowlist, same-command retry, cancellation, error redaction, size/duration, default command flow and merchant guard',
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
