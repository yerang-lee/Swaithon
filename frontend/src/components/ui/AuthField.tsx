import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '../../constants/theme';

type Props = TextInputProps & {
  label: string;
  password?: boolean;
  valid?: boolean;
  compact?: boolean;
  labelColor?: string;
};

export function AuthField({
  label,
  password,
  valid,
  compact = false,
  labelColor,
  ...props
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <Text
        style={[styles.label, labelColor ? { color: labelColor } : undefined]}
      >
        {label}
      </Text>
      <View style={styles.row}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={password && !visible}
          style={styles.input}
          placeholderTextColor="#B0B0B0"
        />
        {valid ? (
          <View accessibilityLabel="비밀번호 일치">
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path
                d="m5 12 4 4L19 6"
                fill="none"
                stroke={theme.colors.primary}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        ) : password ? (
          <Pressable
            onPress={() => setVisible(!visible)}
            accessibilityRole="button"
            accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
            hitSlop={12}
          >
            <Svg width={23} height={23} viewBox="0 0 24 24">
              <Path
                d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"
                fill="none"
                stroke={theme.colors.muted}
                strokeWidth={1.7}
              />
              {!visible && (
                <Path
                  d="m4 20 16-16"
                  stroke={theme.colors.muted}
                  strokeWidth={1.8}
                />
              )}
            </Svg>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 32,
  },
  compactField: {
    marginBottom: 20,
  },
  label: {
    color: '#333333',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    minHeight: 44,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    color: theme.colors.text,
    paddingVertical: 10,
    paddingRight: 12,
  },
});
