import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppIcon } from './AppIcon';
import { theme } from '../../constants/theme';
import type { ExplorationLocation } from '../../services/explorationLocation';
export function LocationButton({
  location,
  onPress,
  error = '',
}: {
  location: ExplorationLocation | null;
  onPress: () => void;
  error?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`위치 설정, ${location?.name || '위치 선택'}, 반경 ${location?.radius ?? 1}킬로미터`}
      style={styles.button}
      onPress={onPress}
    >
      <AppIcon name="location-pin" size={30} color="#4C4F4D" />
      <View style={styles.content}>
        <Text style={styles.caption}>탐색 위치</Text>
        <View style={styles.row}>
          <Text style={styles.name}>
            {location?.name || (error ? '위치 선택' : '위치 확인 중…')}
          </Text>
          <Text style={styles.radius}>반경 {location?.radius ?? 1}km</Text>
        </View>
      </View>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path
          d="m6 9 6 6 6-6"
          fill="none"
          stroke="#B8B8B8"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: '#D5D5D5',
    borderRadius: theme.radii.input,
    minHeight: 74,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  content: {
    flex: 1,
  },
  caption: {
    fontSize: 14,
    color: theme.colors.muted,
    marginBottom: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333333',
  },
  radius: {
    fontSize: 14,
    color: theme.colors.muted,
  },
});
