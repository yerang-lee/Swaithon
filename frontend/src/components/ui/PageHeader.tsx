import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import type { ReactNode } from 'react';
export function PageHeader({
  title,
  onBack,
  backDisabled = false,
  rightAction,
  color = '#181725',
}: {
  title: string;
  onBack?: () => void;
  backDisabled?: boolean;
  rightAction?: ReactNode;
  color?: string;
}) {
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          disabled={backDisabled}
          onPress={onBack}
          style={styles.back}
        >
          <AppIcon name="arrow-back" size={20} color={color} />
        </Pressable>
      )}
      <Text style={[styles.title, !onBack && styles.rootTitle, { color }]}>
        {title}
      </Text>
      {rightAction ?? (
        <>
          <Pressable
            accessibilityLabel="알림"
            onPress={() => Alert.alert('알림', '준비 중이에요.')}
            style={styles.action}
          >
            <AppIcon name="bell" size={26} color={color} />
          </Pressable>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 56,
    paddingVertical: 6,
    gap: 8,
  },
  back: {
    width: 28,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#181725',
  },
  rootTitle: {
    marginLeft: 8,
    fontSize: 28,
  },
  action: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
