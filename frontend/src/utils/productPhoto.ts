import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type ProductPhotoSource = 'camera' | 'library';

export function chooseProductPhotoSource(
  onChoose: (source: ProductPhotoSource) => void,
) {
  if (Platform.OS === 'web') {
    onChoose('library');
    return;
  }
  Alert.alert('상품 사진', '사진을 촬영하거나 앨범에서 선택해주세요.', [
    { text: '사진 촬영', onPress: () => onChoose('camera') },
    { text: '앨범에서 선택', onPress: () => onChoose('library') },
    { text: '취소', style: 'cancel' },
  ]);
}

export async function selectProductPhoto(
  source: ProductPhotoSource,
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        permission.canAskAgain
          ? '사진을 촬영하려면 카메라 권한을 허용해주세요.'
          : '휴대폰 설정에서 카메라 권한을 허용해주세요.',
      );
    }
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 0.85,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0] ?? null);
}
