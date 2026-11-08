import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type {
  ReservationDetail,
  ReservationStatus,
} from '../../services/api/reservations';
import { isPickupQrEligible } from '../../services/api/reservations';
import { logAppError } from '../../utils/appDiagnostics';

function expiryLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
export function ReservationPickupQr({
  detail,
  loading,
  error,
  onRefresh,
  disabled = false,
  testMode = false,
  status,
}: {
  detail: ReservationDetail | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  disabled?: boolean;
  testMode?: boolean;
  status?: ReservationStatus;
}) {
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(Date.now());
  const [renderError, setRenderError] = useState(false);
  const alive = useRef(true);
  const value = detail?.qr_code_data;
  const latestValue = useRef(value);
  latestValue.current = value;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setRenderError(false);
    setNow(Date.now());
    if (!isPickupQrEligible(detail?.status)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [value, detail?.qr_code_expires_at, detail?.status]);
  const expiry = detail?.qr_code_expires_at
    ? Date.parse(detail.qr_code_expires_at)
    : NaN;
  const expired = !Number.isFinite(expiry) || expiry <= now;
  const showQr =
    !loading &&
    !error &&
    !disabled &&
    isPickupQrEligible(detail?.status) &&
    !!value &&
    !expired &&
    !renderError;
  const currentStatus = detail?.status ?? status;
  const hint =
    currentStatus === 'COMPLETED'
      ? '픽업이 완료된 예약이에요.'
      : currentStatus === 'CANCELLED'
        ? '취소된 예약이에요.'
        : isPickupQrEligible(detail?.status) && !!value
          ? expired
            ? 'QR 유효기간이 만료되었어요. 다시 발급받아주세요.'
            : renderError
              ? 'QR 이미지를 표시하지 못했어요. 다시 시도해주세요.'
              : ''
          : 'QR 코드가 아직 발급되지 않았어요. 예약 정보를 새로고침해주세요.';
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>픽업 QR 코드</Text>
      {testMode && (
        <Text style={styles.test}>
          테스트용 QR · 실제 픽업에는 사용할 수 없어요.
        </Text>
      )}
      {loading ? (
        <ActivityIndicator
          accessibilityLabel="예약 상세 및 QR 조회 중"
          color="#53B175"
          style={styles.loading}
        />
      ) : error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : showQr ? (
        <>
          <Text style={styles.message}>
            픽업할 때 상인에게 이 QR 코드를 보여주세요.
          </Text>
          <View
            accessible
            accessibilityLabel="픽업 인증 QR 코드"
            style={styles.qr}
          >
            <QRCode
              value={value!}
              size={Math.min(208, Math.max(120, width - 160))}
              quietZone={24}
              color="#000000"
              backgroundColor="#FFFFFF"
              ecl="M"
              onError={() => {
                logAppError(
                  'reservations/qr-render',
                  new Error('QR 이미지를 생성하지 못했어요.'),
                );
                void Promise.resolve().then(() => {
                  if (alive.current && latestValue.current === value)
                    setRenderError(true);
                });
              }}
            />
          </View>
          <Text style={styles.expiry}>
            유효기간: {expiryLabel(detail!.qr_code_expires_at!)}까지
          </Text>
        </>
      ) : (
        <Text style={styles.message}>
          {disabled ? '예약을 처리하고 있어요.' : hint}
        </Text>
      )}
      {!loading && !disabled && (
        <Pressable
          accessibilityRole="button"
          onPress={onRefresh}
          style={styles.refresh}
        >
          <Text style={styles.refreshLabel}>
            {isPickupQrEligible(detail?.status) && !!value && expired
              ? 'QR 다시 발급받기'
              : '예약 정보 새로고침'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: '#DCE7DF',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: '#181725',
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#555555',
    textAlign: 'center',
  },
  qr: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'center',
  },
  expiry: {
    fontSize: 14,
    lineHeight: 22,
    color: '#777777',
    textAlign: 'center',
  },
  test: {
    fontSize: 14,
    lineHeight: 22,
    color: '#98651E',
    textAlign: 'center',
  },
  error: {
    fontSize: 15,
    lineHeight: 23,
    color: '#C23D3D',
    textAlign: 'center',
  },
  refresh: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  refreshLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#317C4B',
  },
  loading: {
    paddingVertical: 24,
  },
});
