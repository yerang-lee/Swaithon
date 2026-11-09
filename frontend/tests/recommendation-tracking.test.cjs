const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const compile = (file) =>
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
const visibility = {};
new Function('exports', compile('src/utils/recommendationVisibility.ts'))(
  visibility,
);
function harness() {
  let cursor = 0,
    refs = [],
    effects = [],
    focusCallback,
    focusCleanup,
    frames = new Map(),
    nextFrame = 0,
    session = { access_token: 'owner' },
    event = 0;
  const impressions = [],
    views = [],
    listeners = new Set(),
    api = {};
  const app = {
    currentState: 'active',
    addEventListener: (_, fn) => {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
  };
  const react = {
    useRef: (initial) => {
      const i = cursor++;
      return (refs[i] ??= { current: initial });
    },
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
  };
  new Function(
    'require',
    'exports',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    compile('src/hooks/useRecommendationTracking.ts'),
  )(
    (name) => {
      if (name === 'react') return react;
      if (name === 'react-native')
        return {
          AppState: app,
          useWindowDimensions: () => ({ width: 300, height: 600 }),
        };
      if (name === 'expo-router')
        return { useFocusEffect: (fn) => (focusCallback = fn) };
      if (name === '../services/api/auth')
        return { getAuthSession: () => session };
      if (name === '../services/api/recommendationEvents')
        return {
          newRecommendationEventId: () => `evt_view_${++event}`,
          trackRecommendationImpressions: (...args) => impressions.push(args),
          trackRecommendationView: (...args) => views.push(args),
        };
      if (name === '../utils/recommendationVisibility') return visibility;
      return { logAppError() {} };
    },
    api,
    (fn) => {
      const id = ++nextFrame;
      frames.set(id, fn);
      return id;
    },
    (id) => frames.delete(id),
  );
  const cleanups = [];
  return {
    impressions,
    views,
    render(kind, props) {
      focusCleanup?.();
      cleanups.splice(0).forEach((fn) => fn?.());
      cursor = 0;
      effects = [];
      const result = api[kind](props);
      effects.forEach((fn) => cleanups.push(fn()));
      focusCleanup = focusCallback?.();
      return result;
    },
    async flush() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn());
      await new Promise((resolve) => setImmediate(resolve));
    },
    emit(state) {
      app.currentState = state;
      [...listeners].forEach((fn) => fn(state));
    },
    account(token) {
      session = { access_token: token };
    },
    blur() {
      focusCleanup?.();
      focusCleanup = null;
    },
  };
}
const node = (rect) => ({
  measureInWindow: (callback) =>
    callback(rect.x, rect.y, rect.width, rect.height),
});
(async () => {
  const h = harness();
  const parent = { x: 0, y: 100, width: 300, height: 400 },
    carousel = { x: 0, y: 200, width: 300, height: 100 };
  const a = { x: 0, y: 200, width: 100, height: 100 },
    b = { x: 350, y: 200, width: 100, height: 100 };
  const props = {
    requestId: 'rec_a',
    items: [{ listing_id: 'a' }, { listing_id: 'b' }],
    ownerToken: 'owner',
    enabled: true,
    viewportRef: { current: node(parent) },
  };
  let hook = h.render('useRecommendationImpressions', props);
  await h.flush();
  assert.equal(h.impressions.length, 0); // Data receipt alone is not visibility.
  hook.carouselRef.current = node(carousel);
  hook.cardRef('a')(node(a));
  hook.cardRef('b')(node(b));
  await h.flush();
  assert.deepEqual(h.impressions.at(-1), [
    'rec_a',
    [{ listingId: 'a', position: 1 }],
    'owner',
  ]);
  const beforeHidden = h.impressions.length;
  carousel.y = 700;
  a.y = 700;
  b.y = 700;
  hook.checkVisibility();
  await h.flush();
  assert.equal(h.impressions.length, beforeHidden);
  carousel.y = 200;
  a.y = 200;
  b.y = 200;
  a.x = -100;
  b.x = 100;
  hook.checkVisibility();
  await h.flush();
  assert.deepEqual(h.impressions.at(-1)[1], [{ listingId: 'b', position: 2 }]);
  hook = h.render('useRecommendationImpressions', { ...props, enabled: false });
  await h.flush();
  const beforeModal = h.impressions.length;
  hook.checkVisibility();
  await h.flush();
  assert.equal(h.impressions.length, beforeModal);
  hook = h.render('useRecommendationImpressions', props);
  await h.flush();
  h.emit('background');
  const beforeBackground = h.impressions.length;
  hook.checkVisibility();
  await h.flush();
  assert.equal(h.impressions.length, beforeBackground);
  h.emit('active');
  await h.flush();
  assert.ok(h.impressions.length > beforeBackground);
  h.blur();
  const beforeBlur = h.impressions.length;
  hook.checkVisibility();
  await h.flush();
  assert.equal(h.impressions.length, beforeBlur);
  hook = h.render('useRecommendationImpressions', props);
  h.account('different');
  const beforeAccount = h.impressions.length;
  hook.checkVisibility();
  await h.flush();
  assert.equal(h.impressions.length, beforeAccount);
  const detail = harness();
  detail.render('useRecommendationView', {
    requestId: 'rec_a',
    listingId: 'a',
    ready: false,
  });
  assert.equal(detail.views.length, 0);
  detail.render('useRecommendationView', {
    requestId: 'rec_a',
    listingId: 'a',
    ready: true,
  });
  assert.equal(detail.views.length, 1);
  const first = detail.views[0];
  assert.deepEqual([first[0], first[1], first[3]], ['rec_a', 'a', 'owner']);
  detail.render('useRecommendationView', {
    requestId: 'rec_a',
    listingId: 'a',
    ready: true,
  });
  assert.equal(detail.views.at(-1)[2], first[2]);
  detail.render('useRecommendationView', {
    requestId: 'rec_a',
    listingId: 'b',
    ready: true,
  });
  assert.notEqual(detail.views.at(-1)[2], first[2]);
  detail.render('useRecommendationView', { listingId: 'a', ready: true });
  const beforeGeneral = detail.views.length;
  detail.emit('active');
  assert.equal(detail.views.length, beforeGeneral);
  detail.emit('background');
  detail.render('useRecommendationView', {
    requestId: 'rec_a',
    listingId: 'a',
    ready: true,
  });
  assert.equal(detail.views.length, beforeGeneral);
  detail.emit('active');
  assert.ok(detail.views.length > beforeGeneral);
  detail.account('different');
  const count = detail.views.length;
  detail.emit('active');
  assert.equal(detail.views.length, count);
  detail.blur();
  console.log(
    'PASS: actual native viewport measurements, offscreen carousels/cards, modal/tab/background/account guards, loaded detail-only views and stable visit IDs',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
