import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
export function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={onBack} style={styles.back}><AppIcon name="arrow-back" size={20} /></Pressable><Text style={styles.title}>{title}</Text><Pressable accessibilityLabel="알림" onPress={() => Alert.alert('알림', '준비 중이에요.')} style={styles.action}><AppIcon name="bell" /></Pressable><Pressable accessibilityLabel="설정" onPress={() => Alert.alert('설정', '준비 중이에요.')} style={styles.action}><AppIcon name="settings" /></Pressable></View>;
}
const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 6, gap: 8 }, back: { width: 28, height: 40, alignItems: 'center', justifyContent: 'center' }, title: { flex: 1, fontSize: 24, fontWeight: '700', color: '#181725' }, action: { minHeight: 40, minWidth: 34, alignItems: 'center', justifyContent: 'center' } });
