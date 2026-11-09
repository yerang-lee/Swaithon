import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { router } from 'expo-router';
import { AppIcon } from './AppIcon';
import type { ReactNode } from 'react';
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications';
export function PageHeader({
  title,
  onBack,
  backDisabled = false,
  rightAction,
  color = '#181725',
  titleStyle,
}: {
  title: string;
  onBack?: () => void;
  backDisabled?: boolean;
  rightAction?: ReactNode;
  color?: string;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const unreadCount = useUnreadNotifications(rightAction == null);
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
      <Text
        style={[
          styles.title,
          !onBack && styles.rootTitle,
          { color },
          titleStyle,
        ]}
      >
        {title}
      </Text>
      {rightAction ?? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : '알림'
            }
            onPress={() => router.push('/notifications')}
            style={styles.action}
          >
            <View style={styles.bell}>
              <AppIcon name="bell" size={26} color={color} />
              {unreadCount > 0 && (
                <View
                  testID="notification-unread-dot"
                  accessible={false}
                  pointerEvents="none"
                  style={styles.unreadDot}
                />
              )}
            </View>
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
  bell: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53935',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
});
