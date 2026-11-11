const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/utils/productPhoto.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
let buttons,
  selected,
  granted = true,
  canAskAgain = true,
  cancelled = false;
const calls = [];
const platform = { OS: 'ios' };
const asset = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg' };
const modules = {
  'react-native': {
    Platform: platform,
    Alert: { alert: (_, __, options) => (buttons = options) },
  },
  'expo-image-picker': {
    requestCameraPermissionsAsync: async () => {
      calls.push('permission');
      return { granted, canAskAgain };
    },
    launchCameraAsync: async (options) => {
      calls.push(['camera', options]);
      return { canceled: cancelled, assets: [asset] };
    },
    launchImageLibraryAsync: async (options) => {
      calls.push(['library', options]);
      return { canceled: cancelled, assets: [asset] };
    },
  },
};
const api = {};
new Function('require', 'exports', source)((name) => modules[name], api);
(async () => {
  api.chooseProductPhotoSource((source) => (selected = source));
  assert.deepEqual(
    buttons.map((button) => button.text),
    ['사진 촬영', '앨범에서 선택', '취소'],
  );
  buttons[0].onPress();
  assert.equal(selected, 'camera');
  buttons[1].onPress();
  assert.equal(selected, 'library');
  assert.equal(buttons[2].onPress, undefined);
  assert.equal(await api.selectProductPhoto('camera'), asset);
  assert.equal(calls[0], 'permission');
  assert.equal(calls[1][0], 'camera');
  assert.deepEqual(calls[1][1].mediaTypes, ['images']);
  calls.length = 0;
  assert.equal(await api.selectProductPhoto('library'), asset);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'library');
  cancelled = true;
  assert.equal(await api.selectProductPhoto('camera'), null);
  granted = false;
  calls.length = 0;
  await assert.rejects(api.selectProductPhoto('camera'), /카메라 권한/);
  assert.deepEqual(calls, ['permission']);
  canAskAgain = false;
  await assert.rejects(api.selectProductPhoto('camera'), /휴대폰 설정/);
  platform.OS = 'web';
  api.chooseProductPhotoSource((source) => (selected = source));
  assert.equal(selected, 'library');
  console.log(
    'PASS: photo source chooser, camera permission before capture, image-only asset, album selection, cancellation, denied permission and web fallback',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
