const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../src');
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.tsx?$/.test(file)) {
      const source = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(source,
        /devMock|isMockMode|mockRequest|MOCK_API|mock-only|demoProducts|prepareMockAccount|MockModeBanner/,
        path.relative(root, file));
    }
  }
}
scan(root);
assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8'), /MOCK_API/);
console.log('PASS: application has no offline test entry, mock API, sample products or mock environment switch');
