import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import type * as ImagePicker from 'expo-image-picker';
import {
  chooseProductPhotoSource,
  selectProductPhoto,
  type ProductPhotoSource,
} from '../../utils/productPhoto';
import { PageHeader } from '../ui/PageHeader';
import {
  commandProductPresentation,
  confirmedListingId,
} from '../../utils/voiceCommandPresentation';
import { theme } from '../../constants/theme';
import { logAppError } from '../../utils/appDiagnostics';
import { uploadProductImage } from '../../services/api/images';
import type { VoiceCommand } from '../../services/api/voiceCommands';

const intentLabels: Record<string, string> = {
  PRODUCT_CREATE: '신규 등록',
  PRODUCT_UPDATE: '상품 수정',
  SALE_CREATE: '할인 등록',
  SALE_UPDATE: '할인 수정',
  PRODUCT_DELETE: '상품 삭제',
  SOLD_OUT: '품절 처리',
  SALE_DELETE: '할인 종료',
  PRODUCT_DETAIL: '상품 조회',
};
const doneLabels: Record<string, string> = {
  PRODUCT_CREATE: '상품이 등록되었어요!',
  PRODUCT_UPDATE: '상품이 수정되었어요!',
  SALE_CREATE: '할인이 등록되었어요!',
  SALE_UPDATE: '할인이 수정되었어요!',
  PRODUCT_DELETE: '상품이 삭제되었어요!',
  SOLD_OUT: '품절 처리되었어요!',
  SALE_DELETE: '할인이 종료되었어요!',
  PRODUCT_DETAIL: '상품을 조회했어요!',
};
type Props = {
  command: VoiceCommand;
  busy: boolean;
  error: string;
  uncertain: boolean;
  disabled: boolean;
  onConfirm: () => Promise<VoiceCommand | null>;
  onAgain: () => Promise<void>;
  onHome: () => void;
  onBack: () => void;
};
export function CommandResultScreen({
  command,
  busy,
  error,
  uncertain,
  disabled,
  onConfirm,
  onAgain,
  onHome,
  onBack,
}: Props) {
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const done = command.status === 'SUCCEEDED';
  const intent = command.intent;
  const data = {
    ...command.preview.before,
    ...command.preview.after,
    ...(!done ? command.analysis_result : null),
    ...(done ? command.result : null),
  };
  const name =
    typeof data.product_name === 'string'
      ? data.product_name
      : '상품명 정보 없음';
  const quantitySource =
    !done && command.analysis_result ? command.analysis_result : data;
  const quantity =
    typeof quantitySource.sale_quantity === 'number'
      ? quantitySource.sale_quantity
      : '';
  const unit =
    typeof data.unit === 'string'
      ? data.unit
      : typeof data.sale_unit === 'string'
        ? data.sale_unit
        : '';
  const { price, saleActive } = commandProductPresentation(command);
  const executionMissing = !done && !command.execution_endpoint;
  const locked = busy || photoBusy;
  const canPhoto = intent === 'PRODUCT_CREATE' || intent === 'PRODUCT_UPDATE';
  const complete = done && (!photo || uploaded);
  async function pickPhoto(source: ProductPhotoSource) {
    if (locked || uncertain) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const selected = await selectProductPhoto(source);
      if (selected) {
        setPhoto(selected);
        setUploaded(false);
      }
    } catch (e) {
      logAppError('voice/result/photo', e);
      setPhotoError(
        e instanceof Error
          ? e.message
          : '사진을 선택하지 못했어요. 다시 시도해주세요.',
      );
    } finally {
      setPhotoBusy(false);
    }
  }
  async function finish() {
    if (locked) return;
    setPhotoError('');
    const saved = done ? command : await onConfirm();
    if (!saved || saved.status !== 'SUCCEEDED' || !photo || uploaded) return;
    setPhotoBusy(true);
    try {
      const listingId = confirmedListingId(saved);
      if (listingId === null)
        throw new Error(
          '상품은 반영됐지만 사진 연결에 필요한 판매 상품 ID가 없어요. 다시 등록하지 말고 내 상품 목록을 확인해주세요.',
        );
      await uploadProductImage(photo, listingId);
      setUploaded(true);
    } catch (e) {
      logAppError('voice/result/upload', e);
      setPhotoError(
        e instanceof Error
          ? e.message
          : '상품은 반영됐지만 사진을 연결하지 못했어요.',
      );
    } finally {
      setPhotoBusy(false);
    }
  }
  function showProducts() {
    if (!locked) router.push('/my-store');
  }
  const button = (
    title: string,
    onPress: () => void,
    plain = false,
    blocked = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      disabled={locked || blocked}
      onPress={onPress}
      style={[
        plain ? styles.link : styles.button,
        (locked || blocked) && styles.disabled,
      ]}
    >
      <Text style={styles.buttonLabel}>{title}</Text>
    </Pressable>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <PageHeader
        title="상품 등록/수정하기"
        color="white"
        rightAction={<View />}
        backDisabled={locked}
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.main}>
          <Text accessibilityRole="header" style={styles.title}>
            {done
              ? (doneLabels[intent ?? ''] ?? '상품 처리가 완료되었어요!')
              : 'AI 분석 결과'}
          </Text>
          {!done && (
            <Text style={styles.subtitle}>
              AI가 상품명, 가격, 판매 의도를 분석했어요
            </Text>
          )}
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>상품명</Text>
              <Text style={styles.value}>
                {name}
                {quantity !== ''
                  ? ` ${quantity}${unit}`
                  : unit
                    ? ` ${unit}`
                    : ''}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>판매 가격</Text>
              <Text
                style={[styles.value, saleActive === true && styles.salePrice]}
              >
                {price !== null
                  ? `${price.toLocaleString('ko-KR')}원`
                  : '가격 정보 없음'}
              </Text>
              {saleActive === true && (
                <Text style={styles.saleLabel}>할인 중</Text>
              )}
            </View>
            <View style={styles.lastRow}>
              <Text style={styles.value}>
                {intentLabels[intent ?? ''] ?? '정보 없음'}
              </Text>
            </View>
          </View>
          {photo && !complete && (
            <Image
              source={{ uri: photo.uri }}
              accessibilityLabel="선택한 상품 사진"
              style={styles.photo}
            />
          )}
          {!!(error || photoError) && (
            <Text accessibilityRole="alert" style={styles.message}>
              {photoError || error}
            </Text>
          )}
          {executionMissing && (
            <Text style={styles.message}>
              분석 결과를 확인했어요. 최종 반영 기능은 아직 연결되지 않았어요.
            </Text>
          )}
          {uncertain && (
            <Text style={styles.message}>
              처리 결과를 확인하지 못했어요. 아래 버튼을 누르면 같은 요청으로
              다시 확인해요.
            </Text>
          )}
        </View>
        <View style={styles.actions}>
          {complete ? (
            <>
              {button('다른 상품 등록하기', () => void onAgain())}
              {button('내 상품 보기', () => void showProducts())}
              {button('홈으로', onHome, true)}
            </>
          ) : (
            <>
              {canPhoto &&
                button(
                  photo ? '사진 다시 업로드하기' : '사진도 함께 등록하기',
                  () =>
                    chooseProductPhotoSource(
                      (source) => void pickPhoto(source),
                    ),
                  false,
                  disabled || uncertain || done || executionMissing,
                )}
              {button(
                locked
                  ? '처리 중...'
                  : done
                    ? '사진 업로드 다시 시도'
                    : intent === 'PRODUCT_CREATE'
                      ? '이대로 등록하기'
                      : intent === 'PRODUCT_DELETE'
                        ? '이대로 삭제하기'
                        : '이대로 반영하기',
                () => void finish(),
                false,
                (disabled || executionMissing) && !done,
              )}
              {done
                ? button('내 상품 보기', () => void showProducts(), true)
                : button('다시 등록하기', () => void onAgain(), true, uncertain)}
            </>
          )}
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
    paddingBottom: 12,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 40,
    paddingBottom: 36,
  },
  title: {
    fontSize: 37,
    lineHeight: 48,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 19,
    lineHeight: 22,
    color: 'white',
    textAlign: 'center',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#DDEFE3',
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 8,
    marginTop: 22,
    marginHorizontal: 10,
  },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#BED2C4',
  },
  lastRow: {
    paddingVertical: 14,
  },
  label: {
    fontSize: 19,
    fontWeight: '700',
    color: '#101C15',
    marginBottom: 8,
  },
  value: {
    fontSize: 26,
    lineHeight: 29,
    fontWeight: '700',
    color: '#101C15',
  },
  salePrice: {
    color: '#EF4929',
  },
  saleLabel: {
    color: '#176735',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  actions: {
    gap: 8,
  },
  button: {
    minHeight: theme.button.height,
    borderRadius: theme.button.radius,
    backgroundColor: '#106531',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonLabel: {
    color: 'white',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  link: {
    minHeight: theme.button.height,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  message: {
    color: 'white',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 14,
  },
  photo: {
    width: 120,
    height: 100,
    borderRadius: 10,
    alignSelf: 'center',
    marginTop: 16,
  },
});
