import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { theme } from '../../constants/theme';
const tabs: { label: string; icon: IconName }[] = [
  { label: '홈', icon: 'home' },
  { label: '관심상품', icon: 'heart-outline' },
  { label: '예약', icon: 'receipt' },
  { label: '마이', icon: 'account-outline' },
];
export function BottomNavigation({
  active = '홈',
  onSelect,
}: {
  active?: string;
  onSelect: (label: string) => void;
}) {
  return (
    <View style={styles.bar}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.label}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === tab.label }}
          onPress={() => onSelect(tab.label)}
          style={styles.tab}
        >
          <AppIcon
            name={
              tab.label === '홈'
                ? active === tab.label
                  ? 'home-rounded'
                  : 'home-outline-rounded'
                : tab.icon
            }
            size={26}
            color={active === tab.label ? theme.colors.primary : '#181725'}
          />
          <Text
            style={[
              styles.label,
              active === tab.label && { color: theme.colors.primary },
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 8,
    boxShadow: '0 -3px 14px rgba(0,0,0,0.04)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#181725',
  },
});
