import { ApiError, getJson, patchJson, postJson } from './client';
import { getAuthSession } from './auth';
export type Reservation = {
  reservation_id: string; user_id: string; listing_id: string; product_id: string; product_name: string;
  store_id: string; store_name: string; quantity: number; unit_price: number; total_price: number;
  pickup_at: string; request_note: string | null; status: string; created_at: string; message: string;
};
export function pickupAtKst(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19) + '+09:00';
}
export async function reserveProduct(listingId: string, productId: string, quantity: number, pickup: Date, requestNote: string, requestId?: string): Promise<Reservation> {
  if (typeof listingId !== 'string' || !listingId.trim() || typeof productId !== 'string' || !productId.trim() || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('상품과 예약 수량을 확인해주세요.');
  if (!Number.isFinite(pickup.getTime()) || pickup.getTime() <= Date.now() || ![0,30].includes(pickup.getMinutes()) || pickup.getSeconds() !== 0) throw new Error('방문 수령 시간을 다시 선택해주세요.');
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now()) throw new Error('로그인이 필요하거나 만료됐어요. 다시 로그인해주세요.');
  const body = { listing_id: listingId, product_id: productId, quantity, pickup_at: pickupAtKst(pickup), ...(requestNote.trim() ? { request_note: requestNote.trim() } : {}), ...(requestId?.trim() ? { request_id: requestId.trim() } : {}) };
  let data: unknown;
  try { data = await postJson('/reservations', body, session.access_token, 201); }
  catch (error) {
    if (error instanceof ApiError) {
      const messages: Record<number, string> = { 400: '예약 정보 또는 수령 시간을 확인해주세요.', 401: '로그인이 만료됐어요. 다시 로그인해주세요.', 404: '판매 게시물 또는 상품이 존재하지 않아요.', 409: '품절되었거나 예약 가능한 수량이 부족해요.', 422: '수량 또는 수령 시간이 올바르지 않아요.', 500: '서버 오류가 발생했어요. 예약 내역을 확인한 후 다시 시도해주세요.' };
      throw new Error(messages[error.status] || error.message);
    }
    throw new Error(`${error instanceof Error ? error.message : '예약 응답을 확인할 수 없어요.'} 예약 내역을 확인한 후 다시 시도해주세요.`);
  }
  const r = data as Reservation | null;
  if (!r || !['reservation_id','user_id','listing_id','product_id','product_name','store_id','store_name','message','created_at','pickup_at'].every(key => typeof (r as unknown as Record<string,unknown>)[key] === 'string' && String((r as unknown as Record<string,unknown>)[key]).trim().length > 0) || r.listing_id !== listingId || r.product_id !== productId || r.quantity !== quantity || r.status !== 'PENDING' || !Number.isFinite(Date.parse(r.pickup_at)) || Date.parse(r.pickup_at) !== pickup.getTime() || !Number.isFinite(Date.parse(r.created_at)) || !Number.isSafeInteger(r.unit_price) || r.unit_price < 0 || !Number.isSafeInteger(r.total_price) || r.total_price < 0 || !(r.request_note === null || typeof r.request_note === 'string')) throw new Error('예약 응답을 확인할 수 없어요. 중복 예약을 피하려면 예약 내역을 먼저 확인해주세요.');
  return r;
}

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type ReservationItem = { reservation_id: number; product_id: number; product_name: string; store_id: number; store_name: string; market_id: number; market_name: string; quantity: number; unit_price: number; total_price: number; pickup_at: string; status: ReservationStatus; created_at: string };
const statuses: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'];
function reservationToken() {
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, '다시 로그인해주세요.');
  return session.access_token;
}
function reservationError(error: unknown): never {
  if (error instanceof ApiError) {
    const messages: Record<number,string> = {400:'조회 조건을 확인해주세요.',401:'로그인이 만료됐어요. 다시 로그인해주세요.',403:'본인의 예약만 취소할 수 있어요.',404:'예약을 찾을 수 없어요.',409:'현재 상태에서는 취소할 수 없어요. 예약 내역을 새로 확인해주세요.',500:'서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.'};
    throw new ApiError(error.status, messages[error.status] ?? error.message);
  }
  throw error;
}
export async function getReservations(page = 1, status?: ReservationStatus): Promise<{ reservations: ReservationItem[]; total_count: number; page: number; size: number }> {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('페이지를 확인해주세요.');
  const query = new URLSearchParams({page:String(page),size:'10',...(status ? {status} : {})});
  try {
    const result = await getJson(`/users/me/reservations?${query}`, reservationToken()) as { reservations: ReservationItem[]; total_count: number; page: number; size: number };
    if (!result || result.page !== page || result.size !== 10 || !Number.isSafeInteger(result.total_count) || result.total_count < 0 || !Array.isArray(result.reservations) || !result.reservations.every(r => r && ['reservation_id','product_id','store_id','market_id','quantity'].every(key => Number.isSafeInteger((r as unknown as Record<string,unknown>)[key]) && Number((r as unknown as Record<string,unknown>)[key]) > 0) && ['product_name','store_name','market_name','pickup_at','created_at'].every(key => typeof (r as unknown as Record<string,unknown>)[key] === 'string') && [r.unit_price,r.total_price].every(n=>Number.isFinite(n)&&n>=0) && statuses.includes(r.status) && Number.isFinite(Date.parse(r.pickup_at)))) throw new Error('예약 목록 응답을 확인할 수 없어요.');
    return result;
  } catch(e) { return reservationError(e); }
}
export async function cancelReservation(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('예약 ID를 확인해주세요.');
  try {
    const result = await patchJson(`/reservations/${id}/cancel`, undefined, reservationToken()) as { reservation_id: number; status: string; cancelled_at: string; message: string };
    if (!result || result.reservation_id !== id || result.status !== 'CANCELLED' || typeof result.cancelled_at !== 'string' || typeof result.message !== 'string') throw new Error('취소 결과를 확인하지 못했어요. 재시도 전에 예약 내역을 확인해주세요.');
  } catch(e) { reservationError(e); }
}
