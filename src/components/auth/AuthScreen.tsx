import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AuthField } from '../ui/AuthField';
import { PrimaryButton } from '../ui/PrimaryButton';
import { BrandLogo } from './BrandLogo';
import { theme } from '../../constants/theme';

export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  const [nickname, setNickname] = useState('');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  function submit() {
    if (!id.trim() || !password || (signup && (!nickname.trim() || !confirmation))) {
      setError('모든 항목을 입력해주세요.'); return;
    }
    if (signup && password !== confirmation) {
      setError('비밀번호가 일치하지 않아요.'); return;
    }
    setError('');
    Alert.alert(signup ? '회원가입 연동 준비 중' : '로그인 연동 준비 중', '인증 서버가 연결되면 이용할 수 있어요.');
  }

  function showPolicy(title: string) {
    Alert.alert(title, '정식 약관이 준비되면 이곳에서 확인할 수 있어요.');
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.content, signup ? styles.signupContent : styles.loginContent]}>
          {signup ? <Text accessibilityRole="header" style={styles.heading}>회원가입</Text> : <View style={styles.logo}><BrandLogo /></View>}
          {signup && <AuthField label="닉네임" value={nickname} onChangeText={setNickname} returnKeyType="next" />}
          <AuthField label="아이디" value={id} onChangeText={setId} textContentType="username" autoComplete="username" returnKeyType="next" />
          <AuthField label="비밀번호" value={password} onChangeText={setPassword} password textContentType={signup ? 'newPassword' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} returnKeyType={signup ? 'next' : 'done'} onSubmitEditing={signup ? undefined : submit} />
          {signup ? <AuthField label="비밀번호 확인" value={confirmation} onChangeText={setConfirmation} password valid={confirmation.length > 0 && confirmation === password} textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} />
            : <Pressable accessibilityRole="button" onPress={() => Alert.alert('비밀번호 찾기', '비밀번호 재설정 기능은 인증 서버 연결 후 제공됩니다.')} style={styles.forgot}><Text style={styles.smallMuted}>비밀번호를 잊어버리셨나요?</Text></Pressable>}
          {signup && <Text style={styles.policy}>회원가입 시 <Text accessibilityRole="link" onPress={() => showPolicy('이용약관')} style={styles.green}>이용약관</Text> 및 <Text accessibilityRole="link" onPress={() => showPolicy('개인정보 처리방침')} style={styles.green}>개인정보 처리방침</Text>에 동의한 것으로 간주됩니다.</Text>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <PrimaryButton title={signup ? '회원가입' : '로그인'} onPress={submit} />
          {!signup && <View style={styles.signupLink}><Text style={styles.smallMuted}>아직 계정이 없으신가요? </Text><Pressable accessibilityRole="link" onPress={() => router.push('/signup')} hitSlop={8}><Text style={[styles.smallMuted, styles.green]}>회원가입</Text></Pressable></View>}
          {signup && <Pressable accessibilityRole="link" accessibilityLabel="로그인으로 돌아가기" onPress={() => router.replace('/login')} style={styles.back}><Text style={styles.smallMuted}>로그인으로 돌아가기</Text></Pressable>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flexGrow: 1 },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 36 },
  loginContent: { paddingTop: 76 },
  signupContent: { paddingTop: 126 },
  logo: { marginBottom: 76 },
  heading: { color: '#000000', fontSize: 26, fontWeight: '700', marginBottom: 48 },
  forgot: { alignSelf: 'flex-end', marginTop: -18, marginBottom: 32, paddingVertical: 4 },
  smallMuted: { color: theme.colors.muted, fontSize: 13, fontWeight: '600' },
  green: { color: theme.colors.primary, fontWeight: '600' },
  policy: { color: theme.colors.muted, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 28 },
  signupLink: { flexDirection: 'row', justifyContent: 'center', marginTop: 30, flexWrap: 'wrap' },
  back: { alignSelf: 'center', marginTop: 24, padding: 8 },
  error: { color: theme.colors.error, fontSize: 13, marginBottom: 14 },
});
