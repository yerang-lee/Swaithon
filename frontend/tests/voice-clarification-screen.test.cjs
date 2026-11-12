const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const path = require('node:path');
let command = null, retry = false, index = 0;
const jsx = (type, props) => ({ type, props });
class Value { interpolate() { return 0; } }
const modules = {
  react: {
    useEffect() {}, useRef: (value) => ({ current: value }),
    useState: (initial) => {
      const current = index++;
      return [current === 0 ? command : current === 1 ? retry : initial, () => {}];
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    Animated: { Value, View: 'AnimatedView' },
    View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable',
    ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView',
    Platform: { OS: 'ios' }, StyleSheet: { create: (s) => s },
    useWindowDimensions: () => ({ width: 390 }),
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': { useNavigation: () => ({}), router: {} },
  'expo-status-bar': { StatusBar: 'StatusBar' },
  'expo-audio': {
    RecordingPresets: { HIGH_QUALITY: {} },
    useAudioRecorder: () => ({}), useAudioRecorderState: () => ({ durationMillis: 0 }),
  },
  'react-native-svg': { default: 'Svg', Path: 'Path', Rect: 'Rect' },
  '../../constants/theme': { theme: { colors: { primary: '#53B175' }, button: { height: 56, radius: 12 } } },
  '../ui/PageHeader': { PageHeader: 'PageHeader' },
  '../ui/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  '../../services/api/voiceCommands': { AUDIO_LIMIT: { milliseconds: 30000 } },
};
const api = {};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../src/components/merchant/CommandVoiceScreen.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function('require', 'exports', source)((name) => modules[name] ?? {}, api);
function nodes(tree) {
  return !tree || typeof tree !== 'object' ? [] :
    [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
for (const mode of ['pending-command', 'recognition-failure']) {
  index = 0;
  command = mode === 'pending-command' ? {
    command_id: 'pending', status: 'NEEDS_INPUT', transcript: '5천원',
    question: '어떤 상품인가요?', expiresAt: Date.now() + 600000,
  } : null;
  retry = !command;
  const tree = api.CommandVoiceScreen();
  const all = nodes(tree);
  assert.ok(all.some((node) => node.type === 'TextInput'), mode);
  assert.ok(all.some((node) => node.type === 'Pressable' &&
    node.props.accessibilityLabel === '음성 녹음 시작'), mode);
  assert.ok(all.some((node) => node.type === 'PrimaryButton' &&
    node.props.title === (command ? '답변 보내기' : '텍스트 분석')), mode);
  if (command) assert.ok(all.some((node) => node.props.children === '5천원'));
  assert.equal(tree.type, 'SafeAreaView');
}
index = 0;
retry = false;
command = { status: 'CANCELLED', transcript: '복숭아 3개 2천원 할인',
  question: '변경 내용을 확인해 주세요.', expiresAt: Date.now() + 600000 };
const cancelled = nodes(api.CommandVoiceScreen());
assert.ok(cancelled.some(n => n.props.children === '명령이 취소되었어요. 상품 변경은 완료되지 않았어요.'));
assert.ok(cancelled.some(n => n.type === 'PrimaryButton' && n.props.title === '새 작업 시작'));
assert.ok(!cancelled.some(n => n.props.children === command.transcript || n.props.children === command.question));
assert.ok(!cancelled.some(n => n.type === 'TextInput'));
console.log('PASS: clarification inputs and separate cancelled state with restart and no stale transcript/preview');
