import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { logAppError } from '../../utils/appDiagnostics';

export function ProductImageViewer({ visible, uri, label, onClose }: {
  visible: boolean; uri: string; label: string; onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
          <StatusBar style="light" />
          <View style={styles.toolbar}>
            <Pressable accessibilityRole="button" accessibilityLabel="상품 사진 닫기"
              onPress={onClose} style={styles.close}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>
          <Image source={{ uri }} style={styles.image} resizeMode="contain"
            accessibilityLabel={label} onError={() => {
              logAppError('product/image-viewer', new Error('상품 사진을 불러오지 못했어요.'));
            }} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000' },
  toolbar: { alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 4 },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 36, lineHeight: 42, color: '#FFFFFF' },
  image: { flex: 1, width: '100%' },
});
