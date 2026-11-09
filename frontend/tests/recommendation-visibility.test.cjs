const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const api = {};
new Function(
  'exports',
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, '../src/utils/recommendationVisibility.ts'),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
)(api);
const card = { x: 0, y: 200, width: 100, height: 100 };
const screen = { x: 0, y: 0, width: 300, height: 600 };
const outer = { x: 0, y: 100, width: 300, height: 400 };
const carousel = { x: 0, y: 200, width: 300, height: 100 };
assert.equal(
  api.isRecommendationVisible(card, [screen, outer, carousel]),
  true,
);
assert.equal(
  api.isRecommendationVisible({ ...card, x: 250 }, [screen, outer, carousel]),
  true,
);
assert.equal(
  api.isRecommendationVisible({ ...card, x: 251 }, [screen, outer, carousel]),
  false,
);
assert.equal(
  api.isRecommendationVisible({ ...card, x: 400 }, [screen, outer, carousel]),
  false,
);
assert.equal(
  api.isRecommendationVisible({ ...card, y: 550 }, [screen, outer, carousel]),
  false,
);
assert.equal(
  api.isRecommendationVisible({ ...card, y: 50 }, [screen, outer, carousel]),
  false,
);
assert.equal(
  api.isRecommendationVisible({ ...card, width: 0 }, [screen]),
  false,
);
assert.equal(api.isRecommendationVisible({ ...card, x: NaN }, [screen]), false);
assert.equal(api.isRecommendationVisible(card, []), false);
console.log(
  'PASS: card visibility clips horizontal/vertical carousels against parent viewport/window, with a 50% threshold and no empty/invalid layout events',
);
