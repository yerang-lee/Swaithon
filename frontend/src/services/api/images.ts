import { Platform } from 'react-native';
import { postMultipart } from './multipart';
import type { ImagePickerAsset } from 'expo-image-picker';
import { getAuthSession } from './auth';
import { ApiError, deleteJson } from './client';
import { isMockMode } from '../devMock';

export type UploadedProductImage = {
  image_id: number;
  product_id: number | null;
  image_url: string;
  file_name: string;
  uploaded_at: string;
  message: string;
};
export type DeletedProductImage = { image_id: number; message: string };
const mockImages = new Map<
  number,
  { owner: string; image: UploadedProductImage }
>();
let nextMockImageId = 1000;
const validId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

export async function uploadProductImage(
  photo: ImagePickerAsset,
  productId?: number,
): Promise<UploadedProductImage> {
  const session = getAuthSession();
  if (
    !session ||
    session.expiresAt <= Date.now() ||
    session.role !== 'MERCHANT'
  )
    throw new Error('상인 계정으로 다시 로그인해주세요.');
  if (productId !== undefined && !validId(productId))
    throw new Error('상품 ID를 확인해주세요.');
  if (!photo.uri) throw new Error('업로드할 사진을 선택해주세요.');
  if (isMockMode()) {
    const image: UploadedProductImage = {
      image_id: ++nextMockImageId,
      product_id: productId ?? null,
      image_url: photo.uri,
      file_name: photo.fileName ?? 'product.jpg',
      uploaded_at: new Date().toISOString(),
      message: '이미지가 업로드되었습니다.',
    };
    mockImages.set(image.image_id, { owner: session.access_token, image });
    return image;
  }
  if (session.access_token.startsWith('mock-only-'))
    throw new Error('테스트 세션이 종료됐어요. 다시 로그인해주세요.');
  const base = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!base) throw new Error('API 서버 주소가 설정되지 않았어요.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const form = new FormData();
    if (productId !== undefined) form.append('product_id', String(productId));
    if (Platform.OS === 'web') {
      const file =
        photo.file ??
        (await (await fetch(photo.uri, { signal: controller.signal })).blob());
      form.append('image_file', file, photo.fileName ?? 'product.jpg');
    } else {
      form.append('image_file', {
        uri: photo.uri,
        name: photo.fileName ?? 'product.jpg',
        type: photo.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
    }
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
      !validId(data.image_id) ||
      (productId !== undefined
        ? data.product_id !== productId
        : data.product_id != null) ||
      typeof data.file_name !== 'string' ||
      typeof data.uploaded_at !== 'string' ||
      !Number.isFinite(Date.parse(data.uploaded_at)) ||
      typeof data.message !== 'string' ||
      typeof data.image_url !== 'string' ||
      !data.image_url
    )
      throw new Error(
        '업로드 결과를 확인할 수 없어요. 상품 사진을 확인해주세요.',
      );
    return {
      ...data,
      product_id: data.product_id ?? null,
    } as UploadedProductImage;
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

export async function deleteProductImage(
  imageId: number,
): Promise<DeletedProductImage> {
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now())
    throw new Error('다시 로그인해주세요.');
  if (!validId(imageId)) throw new Error('이미지 ID를 확인해주세요.');
  try {
    if (isMockMode()) {
      const saved = mockImages.get(imageId);
      if (!saved) throw new ApiError(404, '이미지를 찾을 수 없어요.');
      if (saved.owner !== session.access_token)
        throw new ApiError(403, '이미지를 삭제할 권한이 없어요.');
      mockImages.delete(imageId);
      return { image_id: imageId, message: '이미지가 삭제되었습니다.' };
    }
    const data = await deleteJson(
      `/images/${imageId}`,
      session.access_token,
      200,
    );
    if (
      !data ||
      typeof data !== 'object' ||
      !('image_id' in data) ||
      data.image_id !== imageId ||
      !('message' in data) ||
      typeof data.message !== 'string'
    )
      throw new Error('이미지 삭제 결과를 확인할 수 없어요.');
    return data as DeletedProductImage;
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/images.ts', error);
    if (error instanceof ApiError) {
      const messages: Record<number, string> = {
        401: '다시 로그인해주세요.',
        403: '이미지를 삭제할 권한이 없어요.',
        404: '이미지를 찾을 수 없어요.',
        409: '상품의 대표 이미지 등 현재 삭제할 수 없는 이미지예요.',
        500: '서버 오류로 이미지를 삭제하지 못했어요.',
      };
      throw new ApiError(
        error.status,
        messages[error.status] ?? '이미지 삭제에 실패했어요.',
      );
    }
    throw error;
  }
}
