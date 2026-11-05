import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../constants/theme';
import { voiceActions, voiceIntentLabels, type VoiceAction, type VoiceResult } from '../../services/api/voice';
import { uploadProductImage } from '../../services/api/images';
import { PageHeader } from '../ui/PageHeader';

export function VoiceResultScreen({ result, action, onDone, onAgain }: { result: VoiceResult; action: VoiceAction; onDone: () => void; onAgain: () => void }) {
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const picking = useRef(false);
  const canAddPhoto = action === 'registration' || action === 'update';
  async function pickPhoto() {
    if (picking.current) return;
    picking.current = true; setSelecting(true); setError('');
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.85 });
      if (!selection.canceled && selection.assets[0]) {
        setPhoto(selection.assets[0]); setUploaded(false);
        await uploadProductImage(selection.assets[0], result.productId);
        setUploaded(true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : '사진을 불러오지 못했어요. 사진 접근 권한을 확인해주세요.'); }
    finally { picking.current = false; setSelecting(false); }
  }
  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <PageHeader color="#FFFFFF" title={voiceActions[action].title} onBack={onDone} backDisabled={selecting} />
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.main}>
        <Text accessibilityRole="header" style={styles.title}>AI 분석 결과</Text>
        <Text style={styles.subtitle}>AI가 상품명과 가격을 분석했어요</Text>
        <View style={styles.card}>
          <View style={styles.row}><Text style={styles.label}>상품명</Text><Text style={styles.value}>{result.productName ? `${result.productName}${result.unit ? ` ${result.unit}` : ''}` : '상품명 정보 없음'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>판매 가격</Text><Text style={styles.value}>{result.price !== undefined ? `${result.price.toLocaleString('ko-KR')}원` : '가격 정보 없음'}</Text></View>
          <Text accessibilityLabel={`작업 목적: ${voiceIntentLabels[action]}`} style={styles.intent}>{voiceIntentLabels[action]}</Text>
        </View>
        {photo && <View style={styles.photoArea}><Image source={{ uri: photo.uri }} accessibilityLabel="선택한 상품 사진" style={styles.photo} /><Text style={styles.photoNotice}>{selecting ? '사진을 업로드하고 있어요...' : uploaded ? '상품에 사진을 연결했어요.' : '사진 업로드가 완료되지 않았어요.'}</Text></View>}
        {!!error && <Text accessibilityRole="alert" style={styles.message}>{error}</Text>}
      </View>
      <View style={styles.actions}>
        {canAddPhoto && !uploaded && <Pressable accessibilityRole="button" disabled={selecting} onPress={() => void pickPhoto()} style={[styles.button, selecting && styles.disabled]}><Text style={styles.buttonLabel}>{selecting ? '사진 선택·업로드 중...' : photo ? '사진 다시 선택하기' : '사진과 함께 등록하기'}</Text></Pressable>}
        <Pressable accessibilityRole="button" disabled={selecting} onPress={onDone} style={styles.button}><Text style={styles.buttonLabel}>{uploaded || !canAddPhoto ? '확인' : '이대로 등록하기'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={selecting} onPress={onAgain} style={styles.again}><Text style={styles.buttonLabel}>{action === 'registration' ? '다시 등록하기' : '다시 녹음하기'}</Text></Pressable>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.primary },
  body: { flexGrow: 1, paddingHorizontal: 32, paddingBottom: 24, width: '100%', maxWidth: 600, alignSelf: 'center' },
  main: { flex: 1, justifyContent: 'center', paddingTop: 44, paddingBottom: 30 },
  title: { color: 'white', fontSize: 35, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: 'white', fontSize: 18, textAlign: 'center', marginTop: 10, marginBottom: 24 },
  card: { backgroundColor: '#E1F0E6', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  row: { borderBottomWidth: 1, borderColor: '#C4D7CB', paddingVertical: 14, gap: 8 },
  label: { color: theme.colors.text, fontSize: 19, fontWeight: '500' },
  value: { color: '#101C15', fontSize: 24, fontWeight: '700', lineHeight: 29 },
  intent: { color: '#101C15', fontSize: 26, fontWeight: '800', paddingVertical: 20, lineHeight: 38 },
  message: { color: 'white', fontSize: 14, textAlign: 'center', marginTop: 16, lineHeight: 21 }, actions: { gap: 10, paddingBottom: 8 }, button: { backgroundColor: '#106531', minHeight: 50, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' }, buttonLabel: { color: 'white', fontSize: 17, fontWeight: '700', textAlign: 'center' }, again: { minHeight: 48, justifyContent: 'center', padding: 12 }, disabled: { opacity: 0.6 }, completionNote: { color: 'white', textAlign: 'center', fontSize: 12, lineHeight: 18 },
  photoArea: { alignItems: 'center', marginTop: 20 }, photo: { width: 160, height: 140, borderRadius: 12 }, remove: { padding: 12 }, removeLabel: { color: 'white', fontWeight: '700' }, photoNotice: { color: 'white', textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
