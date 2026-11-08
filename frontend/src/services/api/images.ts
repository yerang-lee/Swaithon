import { Platform } from 'react-native';
import { postMultipart } from './multipart';
import type { ImagePickerAsset } from 'expo-image-picker';
import { getAuthSession } from './auth';
import { ApiError } from './client';
import { isMockMode } from '../devMock';

export async function uploadProductImage(
  photo: ImagePickerAsset,
  productId: number,
): Promise<void> {
  const session = getAuthSession();
  if (
    !session ||
    session.expiresAt <= Date.now() ||
    session.role !== 'MERCHANT'
  )
    throw new Error('상인 계정으로 다시 로그인해주세요.');
  if (!Number.isSafeInteger(productId) || productId <= 0)
    throw new Error('상품 ID를 확인해주세요.');
  if (isMockMode()) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return;
  }
  const base = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!base) throw new Error('API 서버 주소가 설정되지 않았어요.');
  const form = new FormData();
  form.append('product_id', String(productId));
  if (Platform.OS === 'web') {
    const file = photo.file ?? (await (await fetch(photo.uri)).blob());
    form.append('image_file', file, photo.fileName ?? 'product.jpg');
  } else {
    form.append('image_file', {
      uri: photo.uri,
      name: photo.fileName ?? 'product.jpg',
      type: photo.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await postMultipart(
      `${base.replace(/\/$/, '')}/images`,
      form,
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      },
    );
    const errors: Record<number, string> = {
      400: '사진 업로드 요청을 확인해주세요.',
      401: '다시 로그인해주세요.',
      403: '상품 사진을 변경할 권한이 없어요.',
      404: '상품을 찾을 수 없어요.',
      413: '사진 용량이 너무 커요. 작은 사진을 선택해주세요.',
      415: '지원하지 않는 사진 형식이에요.',
      500: '서버 오류로 사진을 업로드하지 못했어요.',
    };
    if (!response.ok)
      throw new ApiError(
        response.status,
        errors[response.status] ?? '사진 업로드에 실패했어요.',
      );
    const data = await response.json();
    if (
      response.status !== 201 ||
      !data ||
      !Number.isSafeInteger(data.image_id) ||
      data.product_id !== productId ||
      typeof data.image_url !== 'string' ||
      !data.image_url
    )
      throw new Error(
        '업로드 결과를 확인할 수 없어요. 상품 사진을 확인해주세요.',
      );
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/images.ts', error);
    if (controller.signal.aborted || error instanceof TypeError)
      throw new Error(
        '사진 업로드 결과를 확인하지 못했어요. 다시 보내기 전에 상품 사진을 확인해주세요.',
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
