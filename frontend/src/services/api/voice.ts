import { Platform } from 'react-native';
import { getAuthSession } from './auth';
import { ApiError } from './client';
import { isMockMode } from '../devMock';

export const voiceActions = {
  registration: { title: '상품 등록하기', path: '/voice/product-registration' },
  update: { title: '상품 수정·할인하기', path: '/voice/product-update' },
  delete: { title: '상품 삭제하기', path: '/voice/product-delete' },
  soldOut: { title: '상품 품절 처리하기', path: '/voice/sold-out' },
  saleDelete: { title: '할인 종료하기', path: '/voice/sale-delete' },
} as const;
export type VoiceAction = keyof typeof voiceActions;
export type VoiceResult = { productId: number; productName?: string; price?: number; unit?: string; message: string };
export const voiceIntentLabels: Record<VoiceAction, string> = {
  registration: '신규등록', update: '상품 정보 수정', delete: '상품 삭제', soldOut: '품절 처리', saleDelete: '할인 종료',
};

export async function submitVoice(action: VoiceAction, uri: string, id?: number): Promise<VoiceResult> {
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now() || session.role !== 'MERCHANT') throw new Error('상인 계정으로 다시 로그인해주세요.');
  if (isMockMode()) {
    await new Promise(resolve => setTimeout(resolve, 700));
    return { productId: id ?? 101, productName: '사과', price: action === 'update' ? 4000 : 5000, unit: '3개', message: '테스트 처리 완료 · 실제 상품은 변경되지 않았어요.' };
  }
  const base = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!base) throw new Error('API 서버 주소가 설정되지 않았어요.');
  if (action !== 'registration' && (!Number.isSafeInteger(id) || id! <= 0)) throw new Error('올바른 상품 또는 할인 ID를 입력해주세요.');
  const form = new FormData();
  if (action !== 'registration') form.append(action === 'saleDelete' ? 'sale_id' : 'product_id', String(id));
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('audio_file', blob, blob.type.includes('mp4') ? 'voice.m4a' : 'voice.webm');
  } else {
    form.append('audio_file', { uri, name: 'voice.m4a', type: 'audio/mp4' } as unknown as Blob);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    // Content-Type은 FormData가 boundary와 함께 지정합니다. Bearer 인증은 임시 가정입니다.
    const response = await fetch(`${base.replace(/\/$/, '')}${voiceActions[action].path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form, signal: controller.signal,
    });
    const errors: Record<number, string> = { 400: '음성 파일과 상품 정보를 확인해주세요.', 401: '인증이 만료됐어요. 다시 로그인해주세요.', 403: '해당 상품을 관리할 권한이 없어요.', 404: '상품 또는 할인 정보를 찾지 못했어요.', 422: '음성에서 상품 정보를 찾지 못했어요. 더 또렷하게 다시 말해주세요.', 500: '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.' };
    if (!response.ok) throw new ApiError(response.status, errors[response.status] ?? '요청에 실패했어요.');
    const data: unknown = await response.json();
    if (response.status !== (action === 'registration' ? 201 : 200) || !data || typeof data !== 'object' || !('message' in data) || typeof data.message !== 'string' || !('product_id' in data) || !Number.isSafeInteger(data.product_id)) {
      throw new Error('서버 결과를 확인할 수 없어요. 중복 처리 방지를 위해 상품 상태를 확인해주세요.');
    }
    const fields = data as Record<string, unknown>;
    return {
      productId: fields.product_id as number,
      message: data.message,
      ...(typeof fields.product_name === 'string' && fields.product_name.trim() ? { productName: fields.product_name } : {}),
      ...(typeof fields.price === 'number' && Number.isFinite(fields.price) && fields.price >= 0 ? { price: fields.price } : {}),
      ...(typeof fields.unit === 'string' && fields.unit.trim() ? { unit: fields.unit } : {}),
    };
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) throw new Error('서버 응답을 확인하지 못했어요. 중복 처리 방지를 위해 상품 상태를 확인한 후 다시 시도해주세요.');
    throw error;
  } finally { clearTimeout(timeout); }
}
