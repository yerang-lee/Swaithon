import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PageHeader } from '../components/ui/PageHeader';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { getAuthSession } from '../services/api/auth';
import { verifyPickup, type PickupResult } from '../services/api/pickup';
import { logAppError } from '../utils/appDiagnostics';
import { useMockMode } from '../services/devMock';

export default function PickupScan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PickupResult | null>(null);
  const locked = useRef(false);
  const visit = useRef(0);
  const active = useRef(false);
  const testMode = useMockMode();
  useFocusEffect(
    useCallback(() => {
      locked.current = false;
      setBusy(false);
      setError('');
      setResult(null);
      active.current = AppState.currentState === 'active';
      setVisible(active.current);
      const listener = AppState.addEventListener('change', (state) => {
        active.current = state === 'active';
        setVisible(active.current);
      });
      return () => {
        listener.remove();
        active.current = false;
        setVisible(false);
        visit.current++;
      };
    }, []),
  );
  async function scan(data: string) {
    if (locked.current || !active.current) return;
    const session = getAuthSession();
    if (!session || session.role !== 'MERCHANT') return;
    locked.current = true;
    const generation = visit.current;
    setBusy(true);
    setError('');
    try {
      const response = await verifyPickup(data);
      if (
        generation === visit.current &&
        getAuthSession()?.access_token === session.access_token
      )
        setResult(response);
    } catch (e) {
      logAppError('pickup/scan', e);
      if (
        generation === visit.current &&
        getAuthSession()?.access_token === session.access_token
      )
        setError(
          e instanceof Error ? e.message : '픽업 완료 여부를 확인해주세요.',
        );
    } finally {
      if (generation === visit.current) setBusy(false);
    }
  }
  async function allowCamera() {
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      logAppError(
        'pickup/camera-permission',
        new Error('카메라 권한 요청 실패'),
      );
      setError('카메라 권한을 확인해주세요.');
    }
  }
  const merchant = getAuthSession()?.role === 'MERCHANT';
  return (
    <SafeAreaView style={styles.safe}>
      <PageHeader
        title="픽업 QR 스캔"
        onBack={() => router.back()}
        rightAction={<></>}
      />
      <ScrollView contentContainerStyle={styles.body}>
        {!merchant ? (
          <Text style={styles.note}>상인 계정에서 이용할 수 있어요.</Text>
        ) : (
          <>
            {testMode && !result && (
              <Text style={styles.note}>
                테스트 모드 · 실제 예약은 변경되지 않아요.
              </Text>
            )}
            {result ? (
              <View style={styles.card}>
                <Text style={styles.title}>픽업이 완료되었어요</Text>
              </View>
            ) : busy ? (
              <View style={styles.card}>
                <ActivityIndicator color="#53B175" />
                <Text style={styles.note}>픽업을 확인하고 있어요.</Text>
              </View>
            ) : error ? (
              <Text style={styles.note}>{error}</Text>
            ) : !permission ? (
              <ActivityIndicator color="#53B175" />
            ) : !permission.granted ? (
              <View style={styles.card}>
                <Text style={styles.note}>
                  고객의 QR 코드를 스캔하려면 카메라 권한이 필요해요.
                </Text>
                <PrimaryButton
                  title={
                    permission.canAskAgain ? '카메라 허용하기' : '설정 열기'
                  }
                  onPress={() => void allowCamera()}
                />
              </View>
            ) : (
              <>
                <Text style={styles.note}>
                  고객의 픽업 QR 코드를 화면 안에 맞춰주세요.
                </Text>
                <View style={styles.camera}>
                  {visible && (
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={({ data }) => {
                        void scan(data);
                      }}
                      onMountError={() => {
                        locked.current = true;
                        logAppError(
                          'pickup/camera',
                          new Error('카메라 실행 실패'),
                        );
                        setError(
                          '카메라를 실행하지 못했어요. 권한과 기기를 확인해주세요.',
                        );
                      }}
                    />
                  )}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      {merchant && (result || error) && (
        <View style={styles.footer}>
          <PrimaryButton
            title={result ? '다음 QR 스캔하기' : '다시 스캔하기'}
            onPress={() => {
              locked.current = false;
              setResult(null);
              setError('');
            }}
          />
          {result && (
            <Pressable
              accessibilityRole="button"
              style={styles.listLink}
              onPress={() =>
                router.replace({ pathname: '/home', params: { tab: '예약' } })
              }
            >
              <Text style={styles.listLinkText}>예약 목록으로</Text>
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  body: {
    flexGrow: 1,
    padding: 24,
    gap: 24,
    justifyContent: 'center',
  },
  camera: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#181725',
  },
  card: {
    gap: 20,
    paddingVertical: 24,
  },
  title: {
    fontSize: 36,
    lineHeight: 48,
    fontWeight: '700',
    textAlign: 'center',
    color: '#23864C',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: '#181725',
  },
  note: {
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    color: '#666666',
  },
  listLink: {
    minHeight: 44,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLinkText: {
    fontSize: 18,
    color: '#424743',
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
});
