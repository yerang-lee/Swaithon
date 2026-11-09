import { getAuthSession } from './auth';
import { ApiError, postJson } from './client';

export type PickupResult = {
  reservation_id: number;
  listing_id: number;
  product_id: number;
  product_name: string;
  store_name: string;
  status: 'COMPLETED';
  completed_at: string;
  message: string;
};
export async function verifyPickup(qrCodeData: string): Promise<PickupResult> {
  try {
    const session = getAuthSession();
    if (!session || session.expiresAt <= Date.now())
      throw new ApiError(401, '로그인 후 이용해주세요.');
    if (session.role !== 'MERCHANT')
      throw new ApiError(403, '상인 전용 기능이에요.');
    if (typeof qrCodeData !== 'string' || !qrCodeData.trim())
      throw new ApiError(400, '잘못된 QR 코드예요.');
    const data = (await postJson(
      '/reservations/pickup/verify',
      { qr_code_data: qrCodeData },
      session.access_token,
      200,
    )) as PickupResult;
    if (getAuthSession()?.access_token !== session.access_token)
      throw new Error('로그인 계정이 변경됐어요.');
    if (
      !data ||
      ![data.reservation_id, data.listing_id, data.product_id].every(
        (v) => Number.isSafeInteger(v) && v > 0,
      ) ||
      typeof data.product_name !== 'string' ||
      typeof data.store_name !== 'string' ||
      data.status !== 'COMPLETED' ||
      typeof data.completed_at !== 'string' ||
      !Number.isFinite(Date.parse(data.completed_at)) ||
      typeof data.message !== 'string'
    )
      throw new Error(
        '완료 응답을 확인할 수 없어요. 예약 상태를 확인한 후 다시 진행해주세요.',
      );
    return data;
  } catch (error) {
    const status =
      error instanceof ApiError
        ? error.status
        : (error as { status?: number })?.status;
    globalThis.__jangbosoLogError?.(
      'services/api/pickup.ts',
      new Error(`픽업 검증 실패${status ? ` (HTTP ${status})` : ''}`),
    );
    const messages: Record<number, string> = {
      400: '올바른 픽업 QR 코드를 스캔해주세요.',
      401: '로그인이 만료됐어요. 다시 로그인해주세요.',
      403: '해당 예약 가게의 상인만 픽업을 완료할 수 있어요.',
      404: 'QR 코드에 해당하는 예약을 찾을 수 없어요.',
      409: '이미 완료·취소되었거나 픽업 준비가 되지 않은 예약이에요.',
      410: '만료되었거나 이미 사용한 QR 코드예요. 고객에게 새 QR을 요청해주세요.',
      500: '서버 오류가 발생했어요. 예약 상태를 확인해주세요.',
    };
    // QR 원문 또는 서버 응답을 오류 메시지에 포함하지 않습니다.
    throw new Error(
      status && messages[status]
        ? messages[status]
        : '픽업 완료 여부를 확인하지 못했어요. 예약 상태를 확인한 후 다시 진행해주세요.',
    );
  }
}
