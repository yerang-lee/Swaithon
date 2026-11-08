const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../src/services/recordedAudio.ts'),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const platform = { OS: 'android' };
let size = 2048;
const api = {};
new Function('require', 'exports', source)(
  (name) =>
    name === 'react-native'
      ? { Platform: platform }
      : {
          File: class {
            constructor(uri) {
              assert.equal(uri, 'file:///voice.m4a');
              this.size = size;
            }
          },
        },
  api,
);
function recorder() {
  let stopped = false;
  return {
    get isRecording() {
      return !stopped;
    },
    get uri() {
      return 'file:///voice.m4a';
    },
    getStatus() {
      return { durationMillis: stopped ? 0 : 2300, fileSize: 0 };
    },
    async stop() {
      stopped = true;
    },
  };
}
(async () => {
  const audio = await api.finishRecording(recorder());
  assert.equal(audio.durationMillis, 2300);
  assert.equal(audio.fileSize, 2048);
  assert.equal(audio.uri, 'file:///voice.m4a');
  const automatic = {
    isRecording: false,
    uri: 'file:///voice.m4a',
    getStatus() {
      return { durationMillis: 0, fileSize: 0 };
    },
    async stop() {
      throw new Error('already stopped');
    },
  };
  assert.equal(
    (await api.finishRecording(automatic, 29900)).durationMillis,
    29900,
  );
  size = 0;
  assert.equal((await api.finishRecording(recorder())).fileSize, 0);
  platform.OS = 'web';
  let stopped = false;
  const web = {
    get isRecording() {
      return !stopped;
    },
    get uri() {
      return stopped ? 'blob:final' : null;
    },
    getStatus() {
      return { durationMillis: 2300, fileSize: stopped ? 1024 : 0 };
    },
    async stop() {
      stopped = true;
    },
  };
  assert.deepEqual(await api.finishRecording(web), {
    uri: 'blob:final',
    durationMillis: 2300,
    fileSize: 1024,
  });
  console.log(
    'PASS: Android stop reset preserves duration, finalized file size, empty files remain empty, web finalized Blob URI',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
