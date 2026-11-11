import { ApiError, getJson } from './client';
import { getAuthSession } from './auth';
import type { ReservationStatus } from './reservations';

export const merchantReservationStatuses: ReservationStatus[] = [
  'PENDING',
  'CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED',
];
export type MerchantReservation = {
  reservation_id: number;
  customer_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  pickup_at: string;
  request_note: string | null;
  status: ReservationStatus;
  created_at: string;
};
export type MerchantReservationPage = {
  reservations: MerchantReservation[];
  total_count: number;
  page: number;
  size: number;
};
export async function getMerchantReservations(
  options: { page?: number; size?: number; status?: ReservationStatus } = {},
): Promise<MerchantReservationPage> {
  try {
    const page = options.page ?? 1;
    const size = options.size ?? 10;
    if (
      ![page, size].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      (options.status !== undefined &&
        !merchantReservationStatuses.includes(options.status))
    )
      throw new Error('상인 예약 조회 조건을 확인해주세요.');
    const session = getAuthSession();
    if (!session || session.expiresAt <= Date.now())
      throw new ApiError(401, '다시 로그인해주세요.');
    if (session.role !== 'MERCHANT')
      throw new ApiError(403, '상인 계정에서 이용할 수 있어요.');
    const query = new URLSearchParams({
      page: String(page),
      size: String(size),
      ...(options.status ? { status: options.status } : {}),
    });
    const result = (await getJson(
      `/reservations/merchant?${query}`,
      session.access_token,
    )) as MerchantReservationPage;
    if (getAuthSession()?.access_token !== session.access_token)
      throw new Error('로그인 계정이 변경됐어요. 예약을 다시 확인해주세요.');
    if (
      !result ||
      result.page !== page ||
      result.size !== size ||
      !Number.isSafeInteger(result.total_count) ||
      result.total_count < 0 ||
      !Array.isArray(result.reservations) ||
      result.reservations.length > size ||
      result.reservations.length > result.total_count ||
      !result.reservations.every(
        (item) =>
          item &&
          [
            item.reservation_id,
            item.customer_id,
            item.product_id,
            item.quantity,
          ].every((value) => Number.isSafeInteger(value) && value > 0) &&
          [item.unit_price, item.total_price].every(
            (value) => Number.isSafeInteger(value) && value >= 0,
          ) &&
          typeof item.product_name === 'string' &&
          (item.request_note === null ||
            typeof item.request_note === 'string') &&
          merchantReservationStatuses.includes(item.status) &&
          (!options.status || item.status === options.status) &&
          typeof item.pickup_at === 'string' &&
          Number.isFinite(Date.parse(item.pickup_at)) &&
          typeof item.created_at === 'string' &&
          Number.isFinite(Date.parse(item.created_at)),
      ) ||
      new Set(result.reservations.map((item) => item.reservation_id)).size !==
        result.reservations.length
    )
      throw new Error('상인 예약 목록 응답을 확인할 수 없어요.');
    return result;
  } catch (error) {
    const code =
      error instanceof ApiError
        ? error.status
        : (error as { status?: number })?.status;
    globalThis.__jangbosoLogError?.(
      'services/api/merchantReservations.ts',
      new Error(`상인 예약 조회 실패${code ? ` (HTTP ${code})` : ''}`),
    );
    const messages: Record<number, string> = {
      401: '로그인이 만료됐어요. 다시 로그인해주세요.',
      403: '상인 계정과 등록된 가게 정보를 확인해주세요.',
      422: '예약 목록 조회 조건을 확인해주세요.',
      500: '상인 예약 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
    };
    if (code && messages[code]) throw new ApiError(code, messages[code]);
    throw error;
  }
}
