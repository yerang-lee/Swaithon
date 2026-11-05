import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import Svg, { Path, Rect } from 'react-native-svg';
import { getAuthSession } from '../services/api/auth';
import { submitVoice, voiceActions, type VoiceAction, type VoiceResult } from '../services/api/voice';
import { VoiceResultScreen } from '../components/merchant/VoiceResultScreen';
import { theme } from '../constants/theme';
import { isMockMode } from '../services/devMock';
import { PageHeader } from '../components/ui/PageHeader';

export default function VoiceScreen() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recording = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'stopping' | 'sending'>('idle');
  const [action, setAction] = useState<VoiceAction>('registration');
  const [picker, setPicker] = useState(false);
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [levels, setLevels] = useState<number[]>(Array(23).fill(4));
  const busy = useRef(false);
  const recordingToken = useRef<string | null>(null);
  const alive = useRef(true);
  const recordingNow = phase === 'recording';
  const locked = phase !== 'idle' && !recordingNow;
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && recorder.isRecording) {
        void recorder.stop().then(() => { if (alive.current) { setPhase('idle'); setError('녹음이 중단됐어요. 다시 녹음해주세요.'); } }).catch(() => {});
      }
    });
    return () => {
      alive.current = false; subscription.remove();
      if (recorder.isRecording) void recorder.stop().catch(() => {});
    };
  }, [recorder]);
  useEffect(() => {
    if (!recordingNow) return;
    const height = Math.max(4, Math.min(40, ((recording.metering ?? -60) + 60) / 60 * 40));
    setLevels(previous => [...previous.slice(1), height]);
  }, [recording.metering, recording.durationMillis, recordingNow]);

  async function start() {
    if (busy.current) return;
    const session = getAuthSession();
    if (!session || session.expiresAt <= Date.now() || session.role !== 'MERCHANT') { setError('상인 계정으로 로그인해주세요.'); return; }
    if (action !== 'registration' && (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) { setError('올바른 상품 또는 할인 ID를 입력해주세요.'); return; }
    busy.current = true; setPhase('starting'); setError('');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('마이크 권한이 필요해요. 기기 설정에서 마이크 사용을 허용해주세요.');
      if (!alive.current) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!alive.current) return;
      recordingToken.current = session.access_token;
      recorder.record(); setLevels(Array(23).fill(4)); setPhase('recording');
    } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : '녹음을 시작하지 못했어요.'); setPhase('idle'); } }
    finally { busy.current = false; }
  }

  async function stop(cancel: boolean) {
    if (busy.current) return;
    busy.current = true; setPhase('stopping');
    try {
      await recorder.stop();
      if (cancel || !alive.current) return;
      if (getAuthSession()?.access_token !== recordingToken.current) throw new Error('로그인 계정이 변경됐어요. 다시 녹음해주세요.');
      const uri = recorder.uri;
      if (!uri) throw new Error('음성 파일을 찾지 못했어요. 다시 녹음해주세요.');
      setPhase('sending');
      const response = await submitVoice(action, uri, action === 'registration' ? undefined : Number(id));
      if (alive.current) setResult(response);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '음성 처리에 실패했어요.'); }
    finally { busy.current = false; if (alive.current) setPhase('idle'); }
  }

  const seconds = Math.floor(recording.durationMillis / 1000);
  if (result) return <VoiceResultScreen result={result} action={action} onDone={() => router.replace('/home')} onAgain={() => { setResult(null); setError(''); }} />;
  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <PageHeader color="#FFFFFF" title={voiceActions[action].title} backDisabled={locked} onBack={() => { if (recordingNow) void stop(true).then(() => router.back()); else router.back(); }} rightAction={<Pressable accessibilityRole="button" disabled={phase !== 'idle'} onPress={() => setPicker(true)}><Text style={styles.change}>변경</Text></Pressable>} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {action !== 'registration' && <TextInput accessibilityLabel={action === 'saleDelete' ? '할인 ID' : '상품 ID'} placeholder={action === 'saleDelete' ? '할인 ID 입력' : '상품 ID 입력'} keyboardType="number-pad" value={id} onChangeText={setId} editable={phase === 'idle'} style={styles.input} />}
      <View style={styles.center}>
        <Pressable accessibilityRole="button" accessibilityLabel={recordingNow ? '녹음 완료 및 전송' : '음성 녹음 시작'} accessibilityState={{ disabled: locked, selected: recordingNow }} disabled={locked} onPress={() => { if (recordingNow) void stop(false); else void start(); }} style={({ pressed }) => [styles.micRing, pressed && { opacity: 0.8 }]}>
          <View style={styles.micCircle}>{locked ? <ActivityIndicator size="large" color="#176735" /> : <Svg width={66} height={76} viewBox="0 0 64 76"><Rect x={23} y={8} width={18} height={38} rx={9} fill="#176735" /><Path d="M14 37a18 18 0 0 0 36 0M32 56v12" stroke="#176735" strokeWidth={6} strokeLinecap="round" fill="none" /></Svg>}</View>
        </Pressable>
        <View style={styles.instructions}>
          <Text style={styles.heading}>{recordingNow ? '음성을 듣고 있어요...' : phase === 'sending' ? '상품 정보를 처리하고 있어요...' : locked ? '잠시만 기다려주세요...' : '상품 정보를\n음성으로 말해주세요'}</Text>
          {recordingNow ? <><Text style={styles.timer}>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</Text><View style={styles.wave} accessibilityLabel="음성 크기 파형">{levels.map((height, index) => <View key={index} style={[styles.bar, { height }]} />)}</View><Text style={styles.hint}>마이크를 다시 누르면 완료돼요</Text></> : phase === 'idle' && <Text style={styles.example}>{action === 'registration' ? '예) “사과 5개에 5,000원”' : action === 'update' ? '예) “사과 20% 할인해 줘”' : action === 'delete' ? '예) “사과 상품을 삭제해 줘”' : action === 'soldOut' ? '예) “사과 품절 처리해 줘”' : '예) “사과 할인 종료해 줘”'}</Text>}
        </View>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
      <View style={styles.footer}>{recordingNow && <Pressable accessibilityRole="button" onPress={() => void stop(true)} style={styles.cancel}><Text style={styles.cancelLabel}>취소</Text></Pressable>}{isMockMode() && phase === 'idle' && <Pressable accessibilityRole="button" onPress={() => setResult({ productId: 101, productName: '사과', price: 5000, unit: '3개', message: '테스트 분석 결과 · 실제 상품은 변경되지 않았어요.' })} style={styles.cancel}><Text style={styles.cancelLabel}>녹음 없이 결과 테스트</Text></Pressable>}</View>
    </ScrollView>
    <Modal transparent visible={picker} animationType="fade" onRequestClose={() => setPicker(false)}><View style={styles.overlay}><View style={styles.sheet}><Text style={styles.sheetTitle}>어떤 작업을 할까요?</Text>{(Object.keys(voiceActions) as VoiceAction[]).map(key => <Pressable accessibilityRole="button" key={key} style={styles.option} onPress={() => { setAction(key); setId(''); setError(''); setPicker(false); }}><Text style={styles.optionText}>{voiceActions[key].title}</Text></Pressable>)}<Pressable accessibilityRole="button" style={styles.option} onPress={() => setPicker(false)}><Text style={styles.cancelLabel}>닫기</Text></Pressable></View></View></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.primary },
  change: { color: '#FFFFFF', fontSize: 15, paddingVertical: 12 },
  content: { flexGrow: 1, paddingHorizontal: 24 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 32, paddingBottom: 24 },
  micRing: { width: 216, height: 216, borderRadius: 108, backgroundColor: '#A4CEB2', padding: 12 }, micCircle: { flex: 1, borderRadius: 100, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  instructions: { marginTop: 32, alignItems: 'center', minHeight: 156, width: '100%' }, heading: { fontSize: 35, fontWeight: '700', color: 'white', textAlign: 'center', lineHeight: 46 }, example: { fontSize: 18, lineHeight: 27, color: 'white', marginTop: 16, textAlign: 'center' }, timer: { color: 'white', fontSize: 16, fontVariant: ['tabular-nums'], marginTop: 8 }, hint: { color: 'white', fontSize: 14, marginTop: 12 },
  wave: { height: 44, flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 16 }, bar: { width: 4, borderRadius: 3, backgroundColor: 'white' },
  footer: { minHeight: 106, alignItems: 'center', justifyContent: 'center', paddingBottom: 20 }, cancel: { minWidth: 136, minHeight: 56, borderRadius: 16, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }, cancelLabel: { color: theme.colors.primary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  error: { color: 'white', backgroundColor: '#176735', padding: 16, borderRadius: 12, textAlign: 'center', marginTop: 20, lineHeight: 23 }, input: { backgroundColor: 'white', borderRadius: 12, padding: 16, fontSize: 18, marginTop: 12 }, overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 24 }, sheet: { backgroundColor: 'white', borderRadius: 20, padding: 24 }, sheetTitle: { fontSize: 22, fontWeight: '700', marginBottom: 16 }, option: { paddingVertical: 16 }, optionText: { fontSize: 18, color: theme.colors.text },
});
