import { logAppError } from '../../utils/appDiagnostics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearAuthSession,
  getAuthSession,
  logout,
} from '../../services/api/auth';
import { ApiError } from '../../services/api/client';
import {
  deleteMyAccount,
  getMyProfile,
  updateMyProfile,
  type UserProfile,
} from '../../services/api/profile';
import { clearFavorites } from '../../hooks/useFavorites';
import { PrimaryButton } from '../ui/PrimaryButton';
import { AuthField } from '../ui/AuthField';
import { PageHeader } from '../ui/PageHeader';
import { AppIcon } from '../ui/AppIcon';

export function MyPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [panel, setPanel] = useState<'edit' | 'delete' | 'logout' | null>(null);
  const [confirmationAction, setConfirmationAction] = useState<
    'delete' | 'logout'
  >('logout');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [panelError, setPanelError] = useState('');
  const lock = useRef(false);
  function goToLogin() {
    clearAuthSession();
    clearFavorites();
    if (router.canDismiss()) router.dismissAll();
    router.replace('/login');
  }
  useEffect(() => {
    let active = true;
    setFetching(true);
    setError('');
    void getMyProfile()
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((e) => {
        logAppError('components/auth/MyPage.tsx', e);
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) goToLogin();
        else
          setError(
            e instanceof Error ? e.message : '내 정보를 불러오지 못했어요.',
          );
      })
      .finally(() => {
        if (active) setFetching(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  function showMyStore() {
    if (!lock.current) router.push('/my-store');
  }
  async function perform(action: 'logout' | 'save' | 'delete') {
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    setError('');
    setPanelError('');
    try {
      if (action === 'logout') {
        await logout();
        goToLogin();
      } else if (action === 'delete') {
        await deleteMyAccount();
        if (profile)
          await AsyncStorage.removeItem(
            `jangboso.onboarding.${profile.user_id}`,
          ).catch((__caughtError) => {
            logAppError('components/auth/MyPage.tsx', __caughtError);
          });
        goToLogin();
      } else {
        if (!profile) throw new Error('내 정보를 먼저 불러와주세요.');
        const nextPhone = phone.replace(/[\s-]/g, '');
        const changes = {
          ...(name.trim() !== profile.name ? { name: name.trim() } : {}),
          ...(nextPhone !== profile.phone ? { phone: nextPhone } : {}),
        };
        if (Object.keys(changes).length === 0) {
          setPanel(null);
          return;
        }
        setProfile(await updateMyProfile(changes));
        setPanel(null);
      }
    } catch (e) {
      logAppError('components/auth/MyPage.tsx', e);
      if (e instanceof ApiError && e.status === 401) goToLogin();
      else
        setPanelError(
          e instanceof Error
            ? e.message
            : '처리하지 못했어요. 다시 시도해주세요.',
        );
    } finally {
      lock.current = false;
      setLoading(false);
    }
  }
  const menu = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.menu, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.menuLabel}>{label}</Text>
      <AppIcon name="arrow-right" size={16} color="#ADADAD" />
    </Pressable>
  );
  return (
    <View style={styles.container}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <AppIcon name="account-circle" size={62} color="#53B175" />
        </View>
        {fetching ? (
          <ActivityIndicator color="#53B175" />
        ) : (
          <Text style={styles.nickname}>{profile?.name || '내 정보'}</Text>
        )}
      </View>
      {!!error && (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetry((v) => v + 1)}
          >
            <Text style={styles.retry}>다시 불러오기</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.divider} />
      {menu(
        '내 정보 수정',
        () => {
          if (profile) {
            setName(profile.name);
            setPhone(profile.phone);
            setPanelError('');
            setPanel('edit');
          }
        },
        !profile || fetching,
      )}
      <View style={styles.divider} />
      {getAuthSession()?.role === 'MERCHANT' && (
        <>
          {menu('내 상품 보기', () => void showMyStore())}
          <View style={styles.line} />
          {menu('예약 관리', () => router.push('/merchant-reservations'))}
          <View style={styles.line} />
          {menu('픽업 QR 스캔', () => router.push('/pickup-scan'))}
          <View style={styles.divider} />
        </>
      )}
      {menu('로그아웃', () => {
        setPanelError('');
        setConfirmationAction('logout');
        setPanel('logout');
      })}
      <View style={styles.line} />
      {menu('회원탈퇴', () => {
        setPanelError('');
        setConfirmationAction('delete');
        setPanel('delete');
      })}
      {loading && !panel && <ActivityIndicator color="#53B175" />}
      <Modal
        visible={panel === 'edit'}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (!loading) setPanel(null);
        }}
      >
        <SafeAreaProvider
          initialMetrics={initialWindowMetrics}
          style={{ flex: 1 }}
        >
          <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
            <PageHeader
              title="내 정보 수정"
              rightAction={<></>}
              backDisabled={loading}
              onBack={() => setPanel(null)}
            />
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <ScrollView
                contentContainerStyle={styles.form}
                keyboardShouldPersistTaps="handled"
              >
                <AuthField
                  label="닉네임"
                  value={name}
                  onChangeText={setName}
                  editable={!loading}
                  maxLength={50}
                />
                <AuthField
                  label="전화번호"
                  value={phone}
                  onChangeText={setPhone}
                  editable={!loading}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
                {!!panelError && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {panelError}
                  </Text>
                )}
                <PrimaryButton
                  title="저장"
                  loading={loading}
                  onPress={() => void perform('save')}
                />
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
      <Modal
        visible={panel === 'delete' || panel === 'logout'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!loading) setPanel(null);
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.confirm}>
            <Text style={styles.confirmTitle}>
              {confirmationAction === 'logout'
                ? '정말 로그아웃하시겠어요?'
                : '정말 탈퇴하시겠어요?'}
            </Text>
            <Text style={styles.description}>
              {confirmationAction === 'logout'
                ? '현재 계정에서 로그아웃됩니다.'
                : '탈퇴하면 계정을 더 이상 사용할 수 없어요. 처리 중인 예약이 있으면 탈퇴할 수 없습니다.'}
            </Text>
            {!!panelError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {panelError}
              </Text>
            )}
            <View style={styles.confirmActions}>
              <PrimaryButton
                title={
                  confirmationAction === 'logout' ? '로그아웃' : '회원 탈퇴'
                }
                loading={loading}
                onPress={() => {
                  if (panel === 'logout' || panel === 'delete')
                    void perform(panel);
                }}
              />
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={() => setPanel(null)}
                style={styles.cancel}
              >
                <Text style={styles.menuLabel}>취소</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F0F6F2',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nickname: {
    flex: 1,
    fontSize: 23,
    fontWeight: '700',
    color: '#181725',
  },
  divider: {
    height: 7,
    backgroundColor: '#F3F3F3',
  },
  line: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginHorizontal: 24,
  },
  menu: {
    minHeight: 65,
    paddingHorizontal: 28,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: '#181725',
  },
  errorBox: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  error: {
    fontSize: 16,
    color: '#C23D3D',
    lineHeight: 24,
    marginBottom: 16,
  },
  retry: {
    color: '#53B175',
    paddingVertical: 8,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: 'white',
  },
  form: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'center',
    padding: 24,
  },
  confirm: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#181725',
  },
  description: {
    fontSize: 16,
    lineHeight: 25,
    color: '#777777',
    marginBottom: 12,
  },
  confirmActions: {
    gap: 4,
  },
  cancel: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
