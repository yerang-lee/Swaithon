import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { logout } from '../../services/api/auth';
import { ApiError } from '../../services/api/client';
import { clearFavorites } from '../../hooks/useFavorites';
import { PrimaryButton } from '../ui/PrimaryButton';

export function MyPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  function goToLogin() {
    clearFavorites();
    router.dismissAll();
    router.replace('/login');
  }
  async function handleLogout() {
    if (lock.current) return;
    lock.current = true; setLoading(true); setError('');
    try { await logout(); goToLogin(); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        Alert.alert('로그인 필요', e.message);
        goToLogin();
      } else setError(e instanceof Error ? e.message : '로그아웃에 실패했어요. 다시 시도해주세요.');
    } finally { lock.current = false; setLoading(false); }
  }
  return <View style={styles.container}><Text style={styles.title}>마이페이지</Text>
    <PrimaryButton title="로그아웃" compact loading={loading} onPress={handleLogout} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({ container: { paddingVertical: 32, gap: 24 }, title: { fontSize: 23, fontWeight: '800', color: '#181725' }, error: { fontSize: 14, lineHeight: 22, color: '#C23D3D' } });
