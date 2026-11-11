import { logAppError } from '../../utils/appDiagnostics';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AuthField } from '../ui/AuthField';
import { PrimaryButton } from '../ui/PrimaryButton';
import { BrandLogo } from './BrandLogo';
import { theme } from '../../constants/theme';
import * as authApi from '../../services/api/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SignupRoleStep, type SignupProfile } from './SignupRoleStep';
import { registerOnboarding } from '../../services/api/onboarding';
import { ApiError } from '../../services/api/client';
import { logApiError } from '../../utils/apiDiagnostics';
import {
  isMockMode,
  prepareMockAccount,
  setMockMode,
} from '../../services/devMock';
import { clearFavorites } from '../../hooks/useFavorites';

export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  const [nickname, setNickname] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [roleStep, setRoleStep] = useState(false);
  const [createdAccount, setCreatedAccount] =
    useState<authApi.SignupResponse | null>(null);

  async function completeSignup(profile: SignupProfile) {
    if (loading) return;
    setLoading(true);
    setError('');
    let stage = '회원가입';
    try {
      const phone = phoneNumber.replace(/[\s-]/g, '');
      // 로그인 등이 실패해도 이미 생성된 계정을 다시 가입시키지 않습니다.
      const account =
        createdAccount ??
        (await authApi.signup(nickname.trim(), phone, password));
      setCreatedAccount(account);
      stage = '로그인';
      await authApi.login(phone, password);
      stage = '온보딩 저장';
      const result = await registerOnboarding(
        profile.role === 'customer'
          ? { role: 'CUSTOMER' }
          : {
              role: 'MERCHANT',
              kakao_place_id: profile.market.place_id,
              market_name: profile.market.market_name,
              address: profile.market.address,
              latitude: profile.market.latitude,
              longitude: profile.market.longitude,
              store_name: profile.storeName,
              ...(profile.description?.trim()
                ? { description: profile.description.trim() }
                : {}),
            },
      );
      // 서버 저장이 완료된 뒤 캐시 실패가 온보딩 재등록으로 이어지지 않게 합니다.
      await AsyncStorage.setItem(
        `jangboso.onboarding.${account.user_id}`,
        JSON.stringify({ ...profile, server: result }),
      ).catch((__caughtError) => {
        logAppError('components/auth/AuthScreen.tsx', __caughtError);
      });
      setPassword('');
      setConfirmation('');
      router.replace('/home');
    } catch (e) {
      logAppError('components/auth/AuthScreen.tsx', e);
      logApiError(
        'FLOW',
        '/signup',
        `${stage} 단계 실패`,
        e instanceof ApiError ? e.status : undefined,
        e instanceof Error ? e.message : undefined,
        [password, phoneNumber, nickname],
      );
      const status = e instanceof ApiError ? ` · HTTP ${e.status}` : '';
      setError(
        `${stage} 실패${status}: ${e instanceof Error ? e.message : '다시 시도해주세요.'}`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (loading) return;
    const phone = phoneNumber.replace(/[\s-]/g, '');
    if (
      !phone ||
      !password ||
      (signup && (!nickname.trim() || !confirmation))
    ) {
      setError('모든 항목을 입력해주세요.');
      return;
    }
    if (!/^01[0-9]{8,9}$/.test(phone)) {
      setError('올바른 휴대전화번호를 입력해주세요.');
      return;
    }
    if (signup && password !== confirmation) {
      setError('비밀번호가 일치하지 않아요.');
      return;
    }
    if (signup && (password.length < 8 || password.length > 100)) {
      setError('비밀번호는 8~100자로 입력해주세요.');
      return;
    }
    if (signup && nickname.trim().length > 50) {
      setError('닉네임은 50자 이내로 입력해주세요.');
      return;
    }
    // 일반 인증은 이전 테스트 입장 상태와 관계없이 실제 서버를 사용합니다.
    if (isMockMode()) {
      authApi.clearAuthSession();
      clearFavorites();
    }
    setMockMode(false);
    setError('');
    if (signup) {
      setRoleStep(true);
      return;
    }
    setLoading(true);
    try {
      await authApi.login(phone, password);
      router.replace('/home');
    } catch (error) {
      logAppError('components/auth/AuthScreen.tsx', error);
      logApiError(
        'FLOW',
        '/auth/login',
        '로그인 처리 실패',
        error instanceof ApiError ? error.status : undefined,
        error instanceof Error ? error.message : undefined,
        [password, phoneNumber],
      );
      setError(
        error instanceof Error
          ? error.message
          : '요청에 실패했어요. 다시 시도해주세요.',
      );
    } finally {
      setLoading(false);
    }
  }

  function showPolicy(title: string) {
    Alert.alert(title, '정식 약관이 준비되면 이곳에서 확인할 수 있어요.');
  }

  if (signup && roleStep)
    return (
      <SignupRoleStep
        loading={loading}
        error={error}
        onComplete={completeSignup}
        onBack={() => {
          if (createdAccount) {
            setError(
              '계정은 생성되었어요. 완료를 눌러 로그인을 다시 시도해주세요.',
            );
            return;
          }
          setError('');
          setRoleStep(false);
        }}
      />
    );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, signup && styles.signupScroll]}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.content,
              signup ? styles.signupContent : styles.loginContent,
            ]}
          >
            {signup ? (
              <Text accessibilityRole="header" style={styles.heading}>
                회원가입
              </Text>
            ) : (
              <View style={styles.logo}>
                <BrandLogo />
              </View>
            )}
            {signup && (
              <AuthField
                compact={signup}
                label="닉네임"
                value={nickname}
                onChangeText={setNickname}
                returnKeyType="next"
              />
            )}
            <AuthField
              compact={signup}
              label="전화번호"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              returnKeyType="next"
            />
            <AuthField
              compact={signup}
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              password
              textContentType={signup ? 'newPassword' : 'password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              returnKeyType={signup ? 'next' : 'done'}
              onSubmitEditing={signup ? undefined : submit}
            />
            {signup ? (
              <AuthField
                compact={signup}
                label="비밀번호 확인"
                value={confirmation}
                onChangeText={setConfirmation}
                password
                valid={confirmation.length > 0 && confirmation === password}
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={submit}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert(
                    '비밀번호 찾기',
                    '비밀번호 재설정 기능은 인증 서버 연결 후 제공됩니다.',
                  )
                }
                style={styles.forgot}
              >
                <Text style={styles.smallMuted}>
                  비밀번호를 잊어버리셨나요?
                </Text>
              </Pressable>
            )}
            {signup && (
              <Text style={[styles.policy, styles.signupPolicy]}>
                회원가입 시{' '}
                <Text
                  accessibilityRole="link"
                  onPress={() => showPolicy('이용약관')}
                  style={styles.green}
                >
                  이용약관
                </Text>{' '}
                및{' '}
                <Text
                  accessibilityRole="link"
                  onPress={() => showPolicy('개인정보 처리방침')}
                  style={styles.green}
                >
                  개인정보 처리방침
                </Text>
                에 동의한 것으로 간주됩니다.
              </Text>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <PrimaryButton
              title={signup ? '다음' : '로그인'}
              onPress={submit}
              loading={loading}
            />
            {!signup && (
              <View style={styles.signupLink}>
                <Text style={[styles.smallMuted, styles.signupLinkText]}>
                  아직 계정이 없으신가요?{' '}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push('/signup')}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.smallMuted,
                      styles.signupLinkText,
                      styles.green,
                    ]}
                  >
                    회원가입
                  </Text>
                </Pressable>
              </View>
            )}
            {!signup && __DEV__ && (
              <View style={{ gap: 12, marginTop: 24 }}>
                <Text style={styles.smallMuted}>
                  서버 없이 테스트 (예시 데이터)
                </Text>
                {(['MERCHANT', 'CUSTOMER'] as const).map((role) => (
                  <Pressable
                    key={role}
                    accessibilityRole="button"
                    disabled={loading}
                    style={styles.back}
                    onPress={async () => {
                      setLoading(true);
                      setError('');
                      authApi.clearAuthSession();
                      clearFavorites();
                      setMockMode(true);
                      try {
                        await authApi.login(
                          prepareMockAccount(role),
                          'mock-only',
                        );
                        router.replace('/home');
                      } catch (e) {
                        logAppError('components/auth/AuthScreen.tsx', e);
                        setError(
                          e instanceof Error
                            ? e.message
                            : '테스트 입장에 실패했어요.',
                        );
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <Text style={[styles.smallMuted, styles.green]}>
                      {role === 'MERCHANT'
                        ? '상인으로 테스트'
                        : '고객으로 테스트'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {signup && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="로그인으로 돌아가기"
                onPress={() => router.replace('/login')}
                style={[styles.back, styles.signupBack]}
              >
                <Text style={styles.smallMuted}>로그인으로 돌아가기</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  signupScroll: {
    justifyContent: 'center',
    paddingVertical: 20,
  },
  content: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 36,
  },
  loginContent: {
    paddingTop: 76,
  },
  signupContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  logo: {
    marginBottom: 76,
  },
  heading: {
    color: '#000000',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -18,
    marginBottom: 32,
    paddingVertical: 4,
  },
  smallMuted: {
    color: theme.colors.muted,
    fontSize: 17,
    fontWeight: '500',
  },
  green: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  policy: {
    color: theme.colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    marginBottom: 28,
  },
  signupLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    flexWrap: 'wrap',
  },
  signupLinkText: {
    lineHeight: 22,
    includeFontPadding: false,
  },
  signupPolicy: {
    marginTop: 4,
    marginBottom: 20,
  },
  signupBack: {
    marginTop: 12,
  },
  back: {
    alignSelf: 'center',
    marginTop: 24,
    padding: 8,
  },
  error: {
    color: theme.colors.error,
    fontSize: 16,
    marginBottom: 14,
  },
});
