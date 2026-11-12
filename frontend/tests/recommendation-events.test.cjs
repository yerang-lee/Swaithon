const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
class ApiError extends Error {
  constructor(status) {
    super('request failed');
    this.status = status;
  }
}
let now = Date.now(),
  session = { access_token: 'owner', expiresAt: now + 600000 },
  calls = [],
  fail = null,
  badResponse = false,
  viewEventType = 'detail_view',
  timerId = 0;
const timers = new Map();
const clockSetTimeout = (fn, delay) => {
  const id = ++timerId;
  timers.set(id, { fn, at: now + delay });
  return id;
};
class ClockDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [now]));
  }
  static now() {
    return now;
  }
}
const api = {};
new Function(
  'require',
  'exports',
  'setTimeout',
  'clearTimeout',
  'Date',
  compile('src/services/api/recommendationEvents.ts'),
)(
  (name) =>
    name === './auth'
      ? { getAuthSession: () => session }
      : {
          ApiError,
          postJson: async (path, body, token, status) => {
            calls.push({ path, body: structuredClone(body), token, status });
            if (fail) {
              const error = fail;
              fail = null;
              throw error;
            }
            if (badResponse) return {};
            return path.endsWith('impressions')
              ? {
                  request_id: body.request_id,
                  recorded_count: body.events.length,
                  duplicate_count: 0,
                  message: 'saved',
                }
              : {
                  event_id: body.event_id,
                  listing_id: body.listing_id,
                  event_type: viewEventType,
                  recorded_at: new Date(now).toISOString(),
                  message: 'saved',
                };
          },
        },
  api,
  clockSetTimeout,
  (id) => timers.delete(id),
  ClockDate,
);
async function advance(ms) {
  now += ms;
  for (let step = 0; step < 20; step++) {
    const due = [...timers].filter(([, timer]) => timer.at <= now);
    if (!due.length) break;
    for (const [id, timer] of due) {
      timers.delete(id);
      timer.fn();
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
(async () => {
  const generated = new Set();
  for (let i = 0; i < 10000; i++) {
    const id = api.newRecommendationEventId(i % 2 ? 'imp' : 'view');
    assert.ok(id.length <= 36);
    assert.equal(generated.has(id), false);
    generated.add(id);
  }
  const event = {
    event_id: 'imp_contract',
    listing_id: 'listing_1',
    position: 1,
    occurred_at: new Date(now).toISOString(),
  };
  await api.postRecommendationImpressions('rec_contract', [event]);
  assert.deepEqual(calls.at(-1), {
    path: '/recommendations/events/impressions',
    body: { request_id: 'rec_contract', events: [event] },
    token: 'owner',
    status: 200,
  });
  const view = {
    request_id: 'rec_contract',
    event_id: 'view_contract',
    listing_id: 'listing_1',
    occurred_at: event.occurred_at,
  };
  await api.postRecommendationView(view);
  assert.equal(calls.at(-1).status, 201);
  assert.deepEqual(calls.at(-1).body, view);
  viewEventType = 'VIEW';
  await assert.rejects(api.postRecommendationView(view), /결과/);
  viewEventType = 'detail_view';
  await assert.rejects(
    api.postRecommendationImpressions('rec_contract', [
      { ...event, position: 0 },
    ]),
    /형식/,
  );
  await assert.rejects(
    api.postRecommendationImpressions('rec_contract', [event, event]),
    /형식/,
  );
  const beforeLengthGuard = calls.length;
  await assert.rejects(
    api.postRecommendationImpressions('rec_contract', [
      { ...event, event_id: 'x'.repeat(37) },
    ]),
    /형식/,
  );
  await assert.rejects(
    api.postRecommendationView({ ...view, event_id: 'x'.repeat(37) }),
    /형식/,
  );
  assert.equal(calls.length, beforeLengthGuard);
  await api.postRecommendationImpressions('rec_contract', [
    { ...event, event_id: 'x'.repeat(36) },
  ]);
  badResponse = true;
  await assert.rejects(api.postRecommendationView(view), /결과/);
  badResponse = false;
  await assert.rejects(
    api.postRecommendationView(view, 'different-user'),
    (error) => error.status === 401,
  );
  calls = [];
  api.registerRecommendationRequest('rec_1', 'owner');
  api.trackRecommendationImpressions(
    'unknown',
    [{ listingId: 'listing_1', position: 1 }],
    'owner',
  );
  api.trackRecommendationImpressions(
    'rec_1',
    [
      { listingId: 'listing_1', position: 1 },
      { listingId: 'listing_2', position: 2 },
    ],
    'owner',
  );
  api.trackRecommendationImpressions(
    'rec_1',
    [{ listingId: 'listing_1', position: 1 }],
    'owner',
  );
  await advance(100);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.events.length, 2);
  assert.deepEqual(
    calls[0].body.events.map((e) => e.position),
    [1, 2],
  );
  api.trackRecommendationImpressions(
    'rec_1',
    [{ listingId: 'listing_1', position: 1 }],
    'owner',
  );
  await advance(100);
  assert.equal(calls.length, 1);
  api.trackRecommendationView('rec_1', 'listing_1', 'visit_a', 'owner');
  api.trackRecommendationView('rec_1', 'listing_1', 'visit_a', 'owner');
  await advance(100);
  assert.equal(calls.length, 2);
  fail = new ApiError(500);
  api.trackRecommendationView('rec_1', 'listing_1', 'visit_retry', 'owner');
  await advance(100);
  const retry = calls.at(-1);
  await advance(1000);
  assert.deepEqual(calls.at(-1), retry);
  const beforeConflict = calls.length;
  fail = new ApiError(409);
  api.trackRecommendationView('rec_1', 'listing_1', 'visit_conflict', 'owner');
  await advance(100);
  await advance(10000);
  assert.equal(calls.length, beforeConflict + 1);
  const beforeNetwork = calls.length;
  fail = new TypeError('offline');
  api.trackRecommendationView('rec_1', 'listing_1', 'visit_offline', 'owner');
  await advance(100);
  fail = new TypeError('offline');
  await advance(1000);
  fail = new TypeError('offline');
  await advance(3000);
  assert.equal(calls.length, beforeNetwork + 3);
  assert.deepEqual(calls.at(-1).body, calls.at(-2).body);
  await advance(10000);
  assert.equal(calls.length, beforeNetwork + 3);
  api.trackRecommendationView('rec_1', 'listing_1', 'old_account', 'owner');
  const beforeLogout = calls.length;
  session = null;
  await advance(100);
  assert.equal(calls.length, beforeLogout);
  session = { access_token: 'other', expiresAt: now + 600000 };
  api.registerRecommendationRequest('rec_2', 'other');
  api.trackRecommendationImpressions(
    'rec_1',
    [{ listingId: 'listing_1', position: 1 }],
    'owner',
  );
  api.trackRecommendationView('rec_2', 'listing_2', 'new_account', 'other');
  await advance(100);
  assert.equal(calls.at(-1).token, 'other');
  assert.equal(calls.at(-1).body.request_id, 'rec_2');
  assert.equal(timers.size, 0);
  api.registerRecommendationRequest('rec_retry_imp', 'other');
  fail = new ApiError(500);
  api.trackRecommendationImpressions(
    'rec_retry_imp',
    [{ listingId: 'retry_listing', position: 1 }],
    'other',
  );
  await advance(100);
  const impressionRetry = calls.at(-1);
  assert.ok(impressionRetry.body.events[0].event_id.length <= 36);
  await advance(1000);
  assert.deepEqual(calls.at(-1), impressionRetry);
  fail = null;
  await advance(3000);
  assert.deepEqual(calls.at(-1), impressionRetry);
  // Test mode implements server-side duplicate/conflict/ownership semantics as well.
  console.log('PASS: recommendation-events server API regression checks');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
