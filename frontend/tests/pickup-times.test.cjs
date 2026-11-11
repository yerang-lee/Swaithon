const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const api = {};
new Function(
  'exports',
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, '../src/utils/pickupTimes.ts'),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
)(api);
const day = new Date(2026, 10, 9);
const at = (hour, minute = 0, second = 0) =>
  new Date(2026, 10, 9, hour, minute, second);
const labels = (now) =>
  api.pickupTimes(day, now).map((date) => [date.getHours(), date.getMinutes()]);
assert.equal(labels(at(8)).length, 15);
assert.deepEqual(labels(at(8))[0], [9, 0]);
assert.deepEqual(labels(at(8)).at(-1), [16, 0]);
assert.deepEqual(labels(at(10, 10))[0], [10, 30]);
assert.deepEqual(labels(at(10, 30))[0], [10, 30]);
assert.deepEqual(labels(at(10, 30, 1))[0], [11, 0]);
assert.deepEqual(labels(at(15, 29))[0], [15, 30]);
assert.deepEqual(labels(at(15, 30)), [[15, 30], [16, 0]]);
assert.deepEqual(labels(at(15, 30, 1)), [[16, 0]]);
assert.deepEqual(labels(at(16)), [[16, 0]]);
assert.deepEqual(labels(at(16, 0, 1)), []);
assert.deepEqual(labels(at(17)), []);
assert.deepEqual(labels(at(20)), []);
for (const time of api.pickupTimes(day, at(8)))
  assert.ok([0, 30].includes(time.getMinutes()));
console.log(
  'PASS: pickup slots from 09:00 to 16:00, 30-minute intervals, no past slots, exact boundaries and closing time',
);
