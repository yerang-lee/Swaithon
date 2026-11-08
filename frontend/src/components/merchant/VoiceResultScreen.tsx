import { logAppError } from '../../utils/appDiagnostics';
import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { productCategories } from '../../constants/productCategories';
import { theme } from '../../constants/theme';
import {
  applyVoiceAnalysis,
  cancelVoiceAnalysis,
  voiceActions,
  voiceIntentLabels,
  type AppliedAnalysis,
  type ConfirmedFields,
  type VoiceAction,
  type VoiceResult,
} from '../../services/api/voice';
import { getAuthSession } from '../../services/api/auth';
import { ApiError } from '../../services/api/client';
import { uploadProductImage } from '../../services/api/images';
import { PageHeader } from '../ui/PageHeader';

export function VoiceResultScreen({
  result,
  action,
  onDone,
  onAgain,
}: {
  result: VoiceResult;
  action: VoiceAction;
  onDone: () => void;
  onAgain: () => void;
}) {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [navigation]);
  const analysis = result.kind === 'analysis' ? result : null;
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<
    'ready' | 'applying' | 'applied' | 'cancelling' | 'uncertain'
  >('ready');
  const [uploaded, setUploaded] = useState(false);
  const [applied, setApplied] = useState<AppliedAnalysis | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(result.productName ?? '');
  const [price, setPrice] = useState(
    result.price == null ? '' : String(result.price),
  );
  const [unit, setUnit] = useState(result.unit ?? '');
  const [category, setCategory] = useState(analysis?.category ?? '');
  const [categoryName, setCategoryName] = useState(
    analysis?.categoryName ?? '',
  );
  const [rate, setRate] = useState(
    analysis?.discountRate == null ? '' : String(analysis.discountRate),
  );
  const [discountPrice, setDiscountPrice] = useState(
    analysis?.discountPrice == null ? '' : String(analysis.discountPrice),
  );
  const lock = useRef(false);
  const initialToken = useRef(getAuthSession()?.access_token);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!analysis || applied) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [analysis, applied]);
  const expired = !!analysis && now >= Date.parse(analysis.expiresAt);
  const busy = phase === 'applying' || phase === 'cancelling';
  const canEdit =
    !!analysis && (action === 'registration' || action === 'update');
  const canPhoto = action === 'registration' || action === 'update';
  const labels: Record<string, string> = {
    category: '카테고리',
    product_name: '상품명',
    price: '판매 가격',
    unit: '단위',
    discount_rate: '할인율',
    discount_price: '할인 가격',
  };
  function checkSession() {
    if (getAuthSession()?.access_token !== initialToken.current)
      throw new Error(
        '로그인 계정이 바뀌었어요. 다시 로그인하고 분석해주세요.',
      );
  }
  function confirmedFields(): ConfirmedFields | undefined {
    if (!canEdit || !analysis) return undefined;
    if (
      !name.trim() ||
      !/^\d+$/.test(price) ||
      !Number.isSafeInteger(Number(price)) ||
      !category
    )
      throw new Error('상품명, 판매 가격과 카테고리를 확인해주세요.');
    if (action === 'registration' && !unit.trim())
      throw new Error('판매 단위를 입력해주세요.');
    const fields: ConfirmedFields = {
      product_name: name.trim(),
      price: Number(price),
      category,
      category_name: categoryName,
      ...(unit.trim() ? { unit: unit.trim() } : {}),
    };
    if (action === 'update') {
      if (
        (rate === '') !== (discountPrice === '') ||
        (rate !== '' && (!/^\d+(\.\d+)?$/.test(rate) || Number(rate) > 100)) ||
        (discountPrice !== '' &&
          (!/^\d+$/.test(discountPrice) ||
            Number(discountPrice) > Number(price)))
      )
        throw new Error('할인율(0~100)과 할인 가격을 함께 확인해주세요.');
      fields.discount_rate = rate === '' ? null : Number(rate);
      fields.discount_price =
        discountPrice === '' ? null : Number(discountPrice);
    }
    const unresolved = analysis.missingFields.filter(
      (field) =>
        !(field in fields) ||
        fields[field as keyof ConfirmedFields] == null ||
        fields[field as keyof ConfirmedFields] === '',
    );
    if (unresolved.length)
      throw new Error(
        `확인이 필요한 정보: ${unresolved.map((v) => labels[v] ?? v).join(', ')}`,
      );
    return fields;
  }
  async function discard(next: () => void) {
    if (lock.current) return;
    if (!analysis || applied || phase === 'uncertain') {
      next();
      return;
    }
    lock.current = true;
    setPhase('cancelling');
    setError('');
    try {
      checkSession();
      await cancelVoiceAnalysis(analysis.analysisId);
      next();
    } catch (e) {
      logAppError('components/merchant/VoiceResultScreen.tsx', e);
      setError(e instanceof Error ? e.message : '분석을 취소하지 못했어요.');
      setPhase(
        e instanceof ApiError && e.status === 409 ? 'uncertain' : 'ready',
      );
    } finally {
      lock.current = false;
    }
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        void discard(onDone);
        return true;
      },
    );
    return () => subscription.remove();
  });
  async function pickPhoto() {
    if (lock.current || busy || phase === 'uncertain') return;
    lock.current = true;
    setError('');
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.85,
      });
      if (!selection.canceled && selection.assets[0]) {
        setPhoto(selection.assets[0]);
        setUploaded(false);
      }
    } catch (e) {
      logAppError('components/merchant/VoiceResultScreen.tsx', e);
      setError(e instanceof Error ? e.message : '사진을 선택하지 못했어요.');
    } finally {
      lock.current = false;
    }
  }
  async function finish() {
    if (lock.current || phase === 'uncertain') return;
    lock.current = true;
    setError('');
    let saved = applied;
    let submitted = false;
    try {
      checkSession();
      if (analysis && !saved) {
        const fields = confirmedFields();
        setPhase('applying');
        submitted = true;
        saved = await applyVoiceAnalysis(analysis, fields);
        setApplied(saved);
        setPhase('applied');
      }
      const productId =
        saved?.product_id ??
        (result.kind !== 'analysis' ? result.productId : undefined);
      if (photo && !uploaded && productId !== undefined) {
        checkSession();
        setPhase('applying');
        await uploadProductImage(photo, productId);
        setUploaded(true);
      }
      setPhase('applied');
      if (!analysis) onDone();
    } catch (e) {
      logAppError('components/merchant/VoiceResultScreen.tsx', e);
      if (saved) {
        setPhase('applied');
        setError(
          `상품 처리는 완료됐지만 사진 업로드는 확인이 필요해요. ${e instanceof Error ? e.message : ''}`,
        );
      } else if (e instanceof ApiError) {
        setPhase(e.status === 409 || e.status >= 500 ? 'uncertain' : 'ready');
        setError(e.message);
      } else {
        setPhase(submitted ? 'uncertain' : 'ready');
        setError(
          e instanceof Error ? e.message : '처리 결과를 확인하지 못했어요.',
        );
      }
    } finally {
      lock.current = false;
    }
  }
  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    numeric = false,
  ) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={!busy && !applied}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        style={{
          fontSize: 20,
          color: '#101C15',
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderColor: '#A5C6B0',
        }}
      />
    </View>
  );
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <PageHeader
        color="#FFFFFF"
        title={voiceActions[action].title}
        onBack={() => void discard(onDone)}
        backDisabled={busy}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.main}>
          <Text accessibilityRole="header" style={styles.title}>
            {applied ? '처리 완료' : 'AI 분석 결과'}
          </Text>
          <Text style={styles.subtitle}>
            {applied
              ? applied.message
              : analysis
                ? 'AI가 상품명, 가격, 판매 의도를 분석했어요'
                : '상품 처리가 완료되었어요.'}
          </Text>
          <View style={styles.card}>
            {editing && canEdit && !applied ? (
              <>
                {field('상품명', name, setName)}
                {field('판매 가격', price, setPrice, true)}
                {field('단위', unit, setUnit)}
                {action === 'update' && (
                  <>
                    {field('할인율 (%)', rate, setRate, true)}
                    {field('할인 가격', discountPrice, setDiscountPrice, true)}
                  </>
                )}
              </>
            ) : (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>상품명</Text>
                  <Text style={styles.value}>
                    {(applied?.product_name ?? name) || '상품명 정보 없음'}{' '}
                    {unit}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>판매 가격</Text>
                  <Text style={styles.value}>
                    {price !== ''
                      ? `${Number(price).toLocaleString('ko-KR')}원`
                      : '가격 정보 없음'}
                  </Text>
                  {action === 'update' && rate !== '' && (
                    <Text style={styles.label}>
                      {rate}% 할인 ·{' '}
                      {Number(discountPrice).toLocaleString('ko-KR')}원
                    </Text>
                  )}
                </View>
              </>
            )}
            {canEdit && (
              <View style={styles.row}>
                <Text style={styles.label}>카테고리</Text>
                <Text style={styles.value}>
                  {(applied?.category_name ?? categoryName) || '분류 확인 필요'}
                </Text>
                {!applied && editing && (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    {productCategories.map((item) => (
                      <Pressable
                        key={item.code}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: category === item.code }}
                        disabled={busy}
                        onPress={() => {
                          setCategory(item.code);
                          setCategoryName(item.name);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor:
                            category === item.code ? '#176735' : '#A5C6B0',
                          backgroundColor:
                            category === item.code ? '#C9E5D3' : 'transparent',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 16,
                            color: '#101C15',
                            fontWeight: category === item.code ? '700' : '400',
                          }}
                        >
                          {item.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
            <Text style={styles.intent}>{voiceIntentLabels[action]}</Text>
            {action === 'saleDelete' && (
              <Text style={styles.label}>
                {applied
                  ? '할인 판매가 종료되었어요.'
                  : '반영 후 할인 판매가 종료됩니다.'}
              </Text>
            )}
            {action === 'soldOut' && (
              <Text style={styles.label}>
                {applied
                  ? '품절 처리되었어요. 상품은 유지됩니다.'
                  : '확정하면 품절로 표시되며 상품은 삭제되지 않아요.'}
              </Text>
            )}
          </View>
          {analysis && !applied && (
            <>
              {!!analysis.transcript && (
                <Text style={styles.message}>{analysis.transcript}</Text>
              )}
              <Text style={styles.message}>
                {phase === 'uncertain'
                  ? '처리 여부가 불확실해요. 상품 상태를 확인해주세요.'
                  : expired
                    ? '분석이 만료됐어요. 취소 후 다시 녹음해주세요.'
                    : analysis.missingFields.length
                      ? `확인이 필요한 정보: ${analysis.missingFields.map((v) => labels[v] ?? v).join(', ')}`
                      : '아직 상품에 반영되지 않았어요.'}
              </Text>
              {canEdit && (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || phase === 'uncertain'}
                  onPress={() => setEditing((v) => !v)}
                  style={styles.again}
                >
                  <Text style={styles.buttonLabel}>
                    {editing ? '정보 수정 닫기' : '분석 정보 수정하기'}
                  </Text>
                </Pressable>
              )}
            </>
          )}
          {photo && (
            <View style={styles.photoArea}>
              <Image
                source={{ uri: photo.uri }}
                accessibilityLabel="선택한 상품 사진"
                style={styles.photo}
              />
              <Text style={styles.photoNotice}>
                {uploaded
                  ? '사진을 연결했어요.'
                  : '상품 반영 후 선택한 사진 한 장을 업로드해요.'}
              </Text>
            </View>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.message}>
              {error}
            </Text>
          )}
        </View>
        <View style={styles.actions}>
          {canPhoto && !uploaded && (
            <Pressable
              accessibilityRole="button"
              disabled={busy || phase === 'uncertain' || (expired && !applied)}
              onPress={() => void pickPhoto()}
              style={styles.button}
            >
              <Text style={styles.buttonLabel}>
                {photo ? '사진 다시 선택하기' : '사진 선택하기'}
              </Text>
            </Pressable>
          )}
          {(!applied || (photo && !uploaded)) && (
            <Pressable
              accessibilityRole="button"
              disabled={busy || phase === 'uncertain' || (expired && !applied)}
              onPress={() => void finish()}
              style={[
                styles.button,
                (busy || phase === 'uncertain' || (expired && !applied)) &&
                  styles.disabled,
              ]}
            >
              <Text style={styles.buttonLabel}>
                {busy
                  ? '처리 중...'
                  : applied
                    ? '사진 업로드 다시 시도'
                    : analysis
                      ? `${voiceIntentLabels[action]} 확정하기`
                      : '확인'}
              </Text>
            </Pressable>
          )}
          {applied && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onDone}
              style={styles.button}
            >
              <Text style={styles.buttonLabel}>확인</Text>
            </Pressable>
          )}
          {analysis && !applied && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void discard(onDone)}
              style={styles.again}
            >
              <Text style={styles.buttonLabel}>
                {phase === 'uncertain' ? '나가기' : '분석 취소하기'}
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void discard(onAgain)}
            style={styles.again}
          >
            <Text style={styles.buttonLabel}>다시 녹음하기</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 44,
    paddingBottom: 30,
  },
  title: {
    color: 'white',
    fontSize: 35,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#E1F0E6',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  row: {
    borderBottomWidth: 1,
    borderColor: '#C4D7CB',
    paddingVertical: 14,
    gap: 8,
  },
  label: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '500',
  },
  value: {
    color: '#101C15',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 29,
  },
  intent: {
    color: '#101C15',
    fontSize: 26,
    fontWeight: '800',
    paddingVertical: 20,
    lineHeight: 38,
  },
  message: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 21,
  },
  actions: {
    gap: 10,
    paddingBottom: 8,
  },
  button: {
    backgroundColor: '#106531',
    minHeight: 50,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  again: {
    minHeight: 48,
    justifyContent: 'center',
    padding: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  completionNote: {
    color: 'white',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
  photoArea: {
    alignItems: 'center',
    marginTop: 20,
  },
  photo: {
    width: 160,
    height: 140,
    borderRadius: 12,
  },
  remove: {
    padding: 12,
  },
  removeLabel: {
    color: 'white',
    fontWeight: '700',
  },
  photoNotice: {
    color: 'white',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
  },
});
