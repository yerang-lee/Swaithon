import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMockMode, setMockMode } from '../../services/devMock';
import { clearAuthSession } from '../../services/api/auth';
import { clearFavorites } from '../../hooks/useFavorites';

export function MockModeBanner() {
  const enabled = useMockMode();
  if (!enabled) return null;
  return (
    <View
      style={{
        backgroundColor: '#FFF0C2',
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Text style={{ flex: 1, fontSize: 16, color: '#674900' }}>
        서버 없는 테스트 · 예시 데이터 · AI 분석/업로드 모의 처리
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          clearAuthSession();
          clearFavorites();
          setMockMode(false);
          router.replace('/login');
        }}
        style={{ padding: 8 }}
      >
        <Text style={{ fontWeight: '700', color: '#674900' }}>종료</Text>
      </Pressable>
    </View>
  );
}
