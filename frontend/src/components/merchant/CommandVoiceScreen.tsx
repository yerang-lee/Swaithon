import { logAppError } from '../../utils/appDiagnostics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { theme } from '../../constants/theme';
import { PageHeader } from '../ui/PageHeader';
import { PrimaryButton } from '../ui/PrimaryButton';
import Svg, { Path, Rect } from 'react-native-svg';
import { getAuthSession } from '../../services/api/auth';
import { finishRecording } from '../../services/recordedAudio';
import { CommandResultScreen } from './CommandResultScreen';
import { markCatalogChanged } from '../../services/catalogChanges';
import {
  AUDIO_LIMIT,
  CommandError,
  analyzeAudio,
  analyzeText,
  answerAudio,
  answerText,
  cancelCommand,
  executeCommand,
  selectCandidate,
  type VoiceCommand,
} from '../../services/api/voiceCommands';

const intents: Record<string, string> = {
  PRODUCT_CREATE: '상품 등록',
  PRODUCT_UPDATE: '상품 정보 수정',
  SALE_CREATE: '할인 등록',
  PRODUCT_DELETE: '상품 삭제',
  SOLD_OUT: '품절 처리',
  SALE_DELETE: '할인 종료',
  PRODUCT_DETAIL: '상품 조회',
};
export function CommandVoiceScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 100);
  const [command, setCommand] = useState<VoiceCommand | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const ripple = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!recording) {
      ripple.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(ripple, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      ripple.setValue(0);
    };
  }, [recording, ripple]);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false),
    alive = useRef(true),
    startToken = useRef<string | undefined>(undefined);
  const lastDuration = useRef(0);
  useEffect(() => {
    if (recording)
      lastDuration.current = Math.max(
        lastDuration.current,
        state.durationMillis,
      );
  }, [recording, state.durationMillis]);
  const refreshed = useRef(new Set<string>());
  const waiting =
    command?.status === 'NEEDS_INPUT' || command?.status === 'NEEDS_SELECTION';
  const terminal =
    command?.status === 'SUCCEEDED' || command?.status === 'CANCELLED';
  const expired = !!command && now >= command.expiresAt;
  useEffect(() => {
    alive.current = true;
    navigation.setOptions({ gestureEnabled: false });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      navigation.setOptions({ gestureEnabled: true });
      if (recorder.isRecording)
        void recorder.stop().catch((__caughtError) => {
          logAppError(
            'components/merchant/CommandVoiceScreen.tsx',
            __caughtError,
          );
        });
    };
  }, [recorder, navigation]);
  function session() {
    if (
      startToken.current &&
      getAuthSession()?.access_token !== startToken.current
    )
      throw new Error('로그인 계정이 바뀌었어요. 다시 시작해주세요.');
    startToken.current = getAuthSession()?.access_token;
  }
  async function run(task: () => Promise<VoiceCommand>, executing = false) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      session();
      const value = await task();
      if (!alive.current) return null;
      setCommand(value);
      setText('');
      setUncertain(false);
      setBlocked(false);
      if (
        value.status === 'SUCCEEDED' &&
        value.intent !== 'PRODUCT_DETAIL' &&
        !refreshed.current.has(value.command_id)
      ) {
        refreshed.current.add(value.command_id);
        markCatalogChanged();
      }
      return value;
    } catch (e) {
      logAppError('components/merchant/CommandVoiceScreen.tsx', e);
      if (alive.current) {
        setError(e instanceof Error ? e.message : '요청을 처리하지 못했어요.');
        if (
          executing &&
          (!(e instanceof CommandError) || e.status === 0 || e.status >= 500)
        )
          setUncertain(true);
        if (e instanceof CommandError && e.status === 409) {
          setBlocked(!!command);
          setUncertain(false);
        }
      }
      return null;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function stop(cancel = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setRecording(false);
    let audio;
    try {
      if (cancel) {
        if (recorder.isRecording) await recorder.stop();
      } else audio = await finishRecording(recorder, lastDuration.current);
    } catch (e) {
      logAppError('components/merchant/CommandVoiceScreen.tsx', e);
      if (alive.current)
        setError(e instanceof Error ? e.message : '녹음을 종료하지 못했어요.');
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
    if (audio && alive.current) {
      if (waiting && command) await run(() => answerAudio(command, audio));
      else if (!command) await run(() => analyzeAudio(audio));
    }
  }
  async function start() {
    if (
      lock.current ||
      (command && !waiting) ||
      expired ||
      blocked ||
      uncertain
    )
      return;
    lock.current = true;
    setPreparing(true);
    setBusy(true);
    setError('');
    try {
      session();
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          '마이크 권한이 필요해요. 기기 설정에서 마이크 사용을 허용해주세요.',
        );
      if (!alive.current) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      if (!alive.current) return;
      lastDuration.current = 0;
      recorder.record({ forDuration: 30 });
      setRecording(true);
    } catch (e) {
      logAppError('components/merchant/CommandVoiceScreen.tsx', e);
      if (alive.current)
        setError(e instanceof Error ? e.message : '녹음을 시작하지 못했어요.');
    } finally {
      lock.current = false;
      if (alive.current) {
        setPreparing(false);
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    if (!recording) return;
    const timer = setTimeout(() => void stop(), 29500);
    return () => clearTimeout(timer);
  }, [recording]);
  useEffect(() => {
    if (recording && state.fileSize > AUDIO_LIMIT.bytes) {
      void stop(true);
      setError('10MB를 초과해 녹음을 취소했어요.');
    }
  }, [recording, state.fileSize]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (value) => {
      if (value !== 'active' && recording) {
        void stop(true);
        setError('녹음이 중단됐어요. 다시 녹음해주세요.');
      }
    });
    return () => listener.remove();
  }, [recording]);
  async function exit() {
    if (lock.current) return;
    if (recording) await stop(true);
    if (command && !terminal && !uncertain) {
      const value = await run(() => cancelCommand(command));
      if (value?.status !== 'CANCELLED') return;
    }
    router.back();
  }
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      void exit();
      return true;
    });
    return () => listener.remove();
  });
  async function reset() {
    if (command && !terminal) {
      if (uncertain) return;
      const value = await run(() => cancelCommand(command));
      if (value?.status !== 'CANCELLED') return;
    }
    setCommand(null);
    setText('');
    setError('');
    setBlocked(false);
    startToken.current = undefined;
  }
  if (
    command &&
    (command.status === 'NEEDS_CONFIRMATION' || command.status === 'SUCCEEDED')
  )
    return (
      <CommandResultScreen
        command={command}
        busy={busy}
        error={error}
        uncertain={uncertain}
        disabled={blocked || (expired && !uncertain)}
        onConfirm={() => run(() => executeCommand(command, uncertain), true)}
        onAgain={() => reset()}
        onHome={() => router.replace('/home')}
        onBack={() => void exit()}
      />
    );
  if (!command) {
    const seconds = Math.floor(state.durationMillis / 1000);
    const micSize = Math.min(width * 0.58, 240);
    return (
      <SafeAreaView style={recordingStyles.safe} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <PageHeader
          title="상품 등록/수정하기"
          color="#FFFFFF"
          rightAction={<View />}
          onBack={() => void exit()}
          backDisabled={busy}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={recordingStyles.body}
        >
          <View style={recordingStyles.center}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                recording ? '녹음 완료 및 분석' : '음성 녹음 시작'
              }
              accessibilityState={{ selected: recording, disabled: busy }}
              disabled={busy}
              onPress={() => void (recording ? stop() : start())}
              style={({ pressed }) => [
                recordingStyles.micRing,
                { width: micSize, height: micSize, borderRadius: micSize / 2 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {recording &&
                [0, 1].map((index) => {
                  const phase = Animated.modulo(
                    Animated.add(ripple, index * 0.5),
                    1,
                  );
                  return (
                    <Animated.View
                      key={index}
                      pointerEvents="none"
                      accessible={false}
                      style={[
                        recordingStyles.ripple,
                        {
                          borderRadius: micSize / 2,
                          opacity: phase.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.5, 0],
                          }),
                          transform: [
                            {
                              scale: phase.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 1.28],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  );
                })}
              <View style={recordingStyles.micCircle}>
                {busy ? (
                  <ActivityIndicator size="large" color="#176735" />
                ) : (
                  <Svg width={64} height={76} viewBox="0 0 64 76">
                    <Rect
                      x={23}
                      y={8}
                      width={18}
                      height={38}
                      rx={9}
                      fill="#176735"
                    />
                    <Path
                      d="M14 37a18 18 0 0 0 36 0M32 56v12"
                      stroke="#176735"
                      strokeWidth={6}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </Svg>
                )}
              </View>
            </Pressable>
            <View style={recordingStyles.instructions}>
              <Text accessibilityRole="header" style={recordingStyles.heading}>
                {recording
                  ? '음성이 인식되고 있어요...'
                  : busy
                    ? preparing
                      ? '마이크를 준비하고 있어요...'
                      : '상품 정보를\n분석하고 있어요...'
                    : '상품 정보를\n음성으로 말해주세요'}
              </Text>
              {recording ? (
                <Text style={recordingStyles.timer}>
                  {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                  {String(seconds % 60).padStart(2, '0')}
                </Text>
              ) : (
                !busy && (
                  <Text style={recordingStyles.example}>
                    예) “사과 5개에 5,000원”
                  </Text>
                )
              )}
            </View>
            {!!error && (
              <Text accessibilityRole="alert" style={recordingStyles.error}>
                {error}
              </Text>
            )}
          </View>
          <View style={recordingStyles.footer}>
            {recording && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="녹음 취소"
                disabled={busy}
                onPress={() => void stop(true)}
                style={recordingStyles.cancel}
              >
                <Text style={recordingStyles.cancelLabel}>취소</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <PageHeader
        title="상품 등록/수정하기"
        rightAction={<View />}
        onBack={() => void exit()}
        backDisabled={busy}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
        >
          {!!command?.transcript && (
            <View style={styles.card}>
              <Text style={styles.label}>인식한 내용</Text>
              <Text style={styles.value}>{command.transcript}</Text>
            </View>
          )}
          <Text accessibilityRole="header" style={styles.title}>
            {command
              ? (intents[command.intent ?? ''] ?? '상품 정보 확인')
              : '상품 정보를 말해주세요'}
          </Text>
          {command && <Text style={styles.message}>{command.message}</Text>}
          {expired && !terminal && (
            <Text style={styles.error}>
              명령이 만료됐어요. 취소 후 새로 시작해주세요.
            </Text>
          )}
          {command?.status === 'NEEDS_SELECTION' &&
            command.candidates.map((candidate) => (
              <Pressable
                key={String(candidate.listing_id)}
                accessibilityRole="button"
                disabled={busy || recording || expired || blocked}
                onPress={() =>
                  void run(() => selectCandidate(command, candidate.listing_id))
                }
                style={styles.card}
              >
                <Text style={styles.value}>
                  {candidate.product_name ?? '상품'}{' '}
                  {candidate.sale_quantity ?? ''}
                  {candidate.sale_unit ?? ''}
                </Text>
                <Text style={styles.value}>
                  {candidate.price != null
                    ? `${candidate.price.toLocaleString('ko-KR')}원`
                    : ''}
                </Text>
              </Pressable>
            ))}
          {command?.status === 'CANCELLED' && (
            <Text style={styles.message}>상품 변경 없이 취소했어요.</Text>
          )}
          {(!command || waiting) && (
            <View style={!command ? styles.recordingArea : undefined}>
              {!command && (
                <Text style={styles.hint}>
                  등록, 수정, 할인, 품절 처리를 음성으로 말해주세요. 예: “사과
                  한 봉지 5천 원으로 등록해 줘” “사과 20% 할인해 줘” · “사과
                  품절 처리해 줘”
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  recording ? '녹음 종료 및 분석' : '녹음 시작'
                }
                disabled={busy || expired || blocked}
                onPress={() => void (recording ? stop() : start())}
                style={styles.mic}
              >
                <Text style={styles.micText}>{recording ? '■' : ''}</Text>
                {!recording && (
                  <Svg width={58} height={68} viewBox="0 0 64 76">
                    <Rect
                      x={23}
                      y={8}
                      width={18}
                      height={38}
                      rx={9}
                      fill="#176735"
                    />
                    <Path
                      d="M14 37a18 18 0 0 0 36 0M32 56v12"
                      stroke="#176735"
                      strokeWidth={6}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </Svg>
                )}
              </Pressable>
              <Text style={styles.hint}>
                {recording
                  ? `${Math.floor(state.durationMillis / 1000)}초 / 최대 30초`
                  : '최대 30초 · 10MB'}
              </Text>
              {recording && (
                <View style={styles.wave}>
                  {Array.from({ length: 13 }, (_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 5,
                        borderRadius: 3,
                        backgroundColor: '#53B175',
                        height: Math.max(
                          4,
                          ((state.metering ?? -60) + 60) * (0.3 + (i % 4) / 5),
                        ),
                      }}
                    />
                  ))}
                </View>
              )}
              {recording ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void stop(true)}
                  style={styles.secondary}
                >
                  <Text style={styles.value}>녹음 취소</Text>
                </Pressable>
              ) : (
                <>
                  <TextInput
                    accessibilityLabel={
                      command ? '추가 답변' : '상품 정보 텍스트'
                    }
                    placeholder={
                      command
                        ? '질문에 답해주세요'
                        : '예: 사과 가격을 6천 원으로 바꿔줘'
                    }
                    value={text}
                    onChangeText={setText}
                    editable={!busy && !expired && !blocked}
                    multiline
                    style={styles.input}
                  />
                  <PrimaryButton
                    title={command ? '답변 보내기' : '텍스트 분석'}
                    disabled={!text.trim() || expired || blocked}
                    loading={busy}
                    onPress={() =>
                      void run(() =>
                        command ? answerText(command, text) : analyzeText(text),
                      )
                    }
                  />
                </>
              )}
            </View>
          )}
          {busy && <ActivityIndicator color="#53B175" />}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {terminal && (
            <PrimaryButton title="새 작업 시작" onPress={() => void reset()} />
          )}
          {command && !terminal && command.status !== 'NEEDS_CONFIRMATION' && (
            <Pressable
              accessibilityRole="button"
              disabled={busy || recording}
              style={styles.secondary}
              onPress={() => void reset()}
            >
              <Text style={styles.value}>현재 명령 취소</Text>
            </Pressable>
          )}
          {uncertain && (
            <Pressable
              accessibilityRole="button"
              style={styles.secondary}
              disabled={busy}
              onPress={() => void exit()}
            >
              <Text style={styles.value}>나가기</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'white',
  },
  body: {
    flexGrow: 1,
    padding: 24,
    gap: 18,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingBottom: 40,
  },
  title: {
    fontSize: 27,
    fontWeight: '700',
    color: '#181725',
  },
  message: {
    fontSize: 18,
    lineHeight: 27,
    color: '#333333',
  },
  card: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    gap: 10,
  },
  label: {
    fontSize: 15,
    color: '#777777',
    fontWeight: '600',
    marginBottom: 8,
  },
  value: {
    fontSize: 17,
    lineHeight: 25,
    color: '#181725',
  },
  comparison: {
    gap: 14,
  },
  compareCard: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#F2F8F4',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5D5D5',
    borderRadius: 12,
    padding: 16,
    minHeight: 80,
    fontSize: 18,
    color: '#181725',
  },
  recordingArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 24,
  },
  mic: {
    width: 216,
    height: 216,
    borderRadius: 108,
    backgroundColor: '#E5F3EA',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  micText: {
    fontSize: 55,
    color: '#176735',
  },
  hint: {
    fontSize: 14,
    lineHeight: 22,
    color: '#858585',
    textAlign: 'center',
  },
  error: {
    fontSize: 15,
    lineHeight: 23,
    color: '#C23D3D',
  },
  secondary: {
    padding: 12,
    minHeight: 44,
    alignItems: 'center',
  },
  wave: {
    height: 44,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const recordingStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 96,
    paddingBottom: 24,
  },
  micRing: {
    padding: 12,
    backgroundColor: '#A4CEB2',
  },
  ripple: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  micCircle: {
    flex: 1,
    borderRadius: 200,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructions: {
    marginTop: 44,
    minHeight: 128,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 36,
    lineHeight: 45,
    fontWeight: '700',
    textAlign: 'center',
  },
  example: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 27,
    marginTop: 14,
    textAlign: 'center',
  },
  timer: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 6,
  },
  footer: {
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  cancel: {
    minHeight: theme.button.height,
    minWidth: 136,
    borderRadius: theme.button.radius,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  cancelLabel: {
    color: theme.colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    color: '#FFFFFF',
    backgroundColor: '#176735',
    fontSize: 15,
    lineHeight: 23,
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    textAlign: 'center',
  },
});
