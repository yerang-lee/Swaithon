import { getAuthSession } from './auth';
import { ApiError, getJson } from './client';

export type PricePoint = { price: number; recorded_at: string };
export type PriceHistory = {
  listing_id: number;
  product_id: number;
  product_name: string;
  store_id: number;
  store_name: string;
  current_price: number;
  has_demo_history?: boolean;
  price_history: PricePoint[];
};
export async function getPriceHistory(id: string): Promise<PriceHistory> {
  try {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new Error('가격 이력 조회에는 정수 상품 ID가 필요해요.');
    const session = getAuthSession();
    if (!session || session.expiresAt <= Date.now())
      throw new Error('로그인 후 가격 이력을 확인해주세요.');
    const data = (await getJson(
      `/products/${id}/price-history`,
      session.access_token,
    )) as PriceHistory;
    if (getAuthSession()?.access_token !== session.access_token)
      throw new Error('계정이 변경됐어요. 다시 조회해주세요.');
    const positiveId = (v: number) => Number.isSafeInteger(v) && v > 0;
    const price = (v: number) => Number.isSafeInteger(v) && v >= 0;
    if (
      !data ||
      data.listing_id !== Number(id) ||
      !positiveId(data.product_id) ||
      !positiveId(data.store_id) ||
      typeof data.product_name !== 'string' ||
      typeof data.store_name !== 'string' ||
      !price(data.current_price) ||
      (data.has_demo_history !== undefined && typeof data.has_demo_history !== 'boolean') ||
      !Array.isArray(data.price_history) ||
      data.price_history.some(
        (p, i, all) =>
          !p ||
          !price(p.price) ||
          typeof p.recorded_at !== 'string' ||
          !Number.isFinite(Date.parse(p.recorded_at)) ||
          (i > 0 &&
            Date.parse(p.recorded_at) < Date.parse(all[i - 1].recorded_at)),
      )
    )
      throw new Error('가격 이력 응답 형식이 명세와 달라요.');
    return data;
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/priceHistory.ts', error);
    if (error instanceof ApiError) {
      if (error.status === 401)
        throw new Error('로그인이 만료됐어요. 다시 로그인해주세요.');
      if (error.status === 404)
        throw new Error('상품의 가격 이력을 찾을 수 없어요.');
      if (error.status === 500)
        throw new Error(
          '가격 이력을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
        );
    }
    throw error;
  }
}
