import { ApiError, postJson } from './client';
import { getAuthSession } from './auth';
export type Reservation = {
  reservation_id: number; user_id: number; product_id: number; product_name: string;
  store_id: number; store_name: string; quantity: number; unit_price: number; total_price: number;
  pickup_at: string; request_note: string | null; status: string; created_at: string; message: string;
};
export function pickupAtKst(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19);
}
export async function reserveProduct(productId: number, quantity: number, pickup: Date, requestNote: string): Promise<Reservation> {
  if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('상품과 예약 수량을 확인해주세요.');
  if (!Number.isFinite(pickup.getTime()) || pickup.getTime() <= Date.now() || ![0,30].includes(pickup.getMinutes()) || pickup.getSeconds() !== 0) throw new Error('방문 수령 시간을 다시 선택해주세요.');
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now()) throw new Error('로그인이 필요하거나 만료됐어요. 다시 로그인해주세요.');
  const body = { product_id: productId, quantity, pickup_at: pickupAtKst(pickup), ...(requestNote.trim() ? { request_note: requestNote.trim() } : {}) };
  let data: unknown;
  try { data = await postJson('/reservations', body, session.access_token); }
  catch (error) {
    if (error instanceof ApiError) {
      const messages: Record<number, string> = { 400: '예약 정보 또는 수령 시간을 확인해주세요.', 401: '로그인이 만료됐어요. 다시 로그인해주세요.', 404: '상품이 존재하지 않아요.', 409: '품절되었거나 예약 가능한 수량이 부족해요.', 422: '수량 또는 수령 시간이 올바르지 않아요.', 500: '서버 오류가 발생했어요. 예약 내역을 확인한 후 다시 시도해주세요.' };
      throw new Error(messages[error.status] || error.message);
    }
    throw new Error(`${error instanceof Error ? error.message : '예약 응답을 확인할 수 없어요.'} 예약 내역을 확인한 후 다시 시도해주세요.`);
  }
  const r = data as Reservation | null;
  if (!r || !Number.isInteger(r.reservation_id) || r.product_id !== productId || r.quantity !== quantity || typeof r.message !== 'string' || typeof r.pickup_at !== 'string' || typeof r.status !== 'string' || !Number.isFinite(r.total_price)) throw new Error('예약 응답을 확인할 수 없어요. 중복 예약을 피하려면 예약 내역을 먼저 확인해주세요.');
  return r;
}
