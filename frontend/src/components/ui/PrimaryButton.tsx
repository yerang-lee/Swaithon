import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { PressableProps } from 'react-native';
import { theme } from '../../constants/theme';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  loading?: boolean;
  compact?: boolean;
  tone?: 'primary' | 'danger';
};

/** 앱 전역의 기본 초록 버튼. 색상과 모서리는 theme에서 관리합니다. */
export function PrimaryButton({
  title,
  loading = false,
  compact = false,
  tone = 'primary',
  disabled,
  ...props
}: Props) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        tone === 'danger' && styles.danger,
        compact && styles.compact,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text style={styles.label}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.button.radius,
    minHeight: theme.button.height,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  compact: {
    minHeight: 48,
  },
  danger: {
    backgroundColor: '#E54848',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
