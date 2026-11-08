const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/utils/voiceCommandPresentation.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const api = {};
new Function('exports', source)(api);
const command = {
  status: 'NEEDS_CONFIRMATION',
  intent: 'SALE_CREATE',
  preview: {
    before: { price: 9000, effective_price: 7000, sale_active: true },
    after: {
      price: 10000,
      effective_price: 8000,
      sale_active: false,
      ends_at: '2099-01-01T00:00:00Z',
    },
  },
  result: null,
};
const original = JSON.stringify(command);
assert.deepEqual(api.commandProductPresentation(command), {
  price: 8000,
  saleActive: false,
});
command.preview.after.sale_active = true;
command.preview.after.ends_at = '2000-01-01T00:00:00Z';
assert.deepEqual(api.commandProductPresentation(command), {
  price: 8000,
  saleActive: true,
});
command.preview.after.effective_price = 0;
assert.equal(api.commandProductPresentation(command).price, 0);
command.preview.after = { price: 5000 };
assert.deepEqual(api.commandProductPresentation(command), {
  price: null,
  saleActive: null,
});
command.status = 'SUCCEEDED';
command.result = {
  price: 11000,
  effective_price: 11000,
  sale_active: false,
  ends_at: null,
};
const before = JSON.stringify(command);
assert.deepEqual(api.commandProductPresentation(command), {
  price: 11000,
  saleActive: false,
});
assert.equal(JSON.stringify(command), before);
command.result = { price: 12000 };
assert.deepEqual(api.commandProductPresentation(command), {
  price: null,
  saleActive: null,
});
command.preview.after = JSON.parse(original).preview.after;
command.status = 'NEEDS_CONFIRMATION';
const view = api.commandProductPresentation(command);
assert.deepEqual(Object.keys(view), ['price', 'saleActive']);
assert.equal(command.preview.after.ends_at, '2099-01-01T00:00:00Z');
console.log(
  'PASS: server effective price including zero, sale flag regardless of dates, no stale preview fallback, hidden time fields preserved',
);
