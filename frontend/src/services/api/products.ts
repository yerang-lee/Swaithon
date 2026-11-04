import { ApiError, getJson } from './client';
export type ProductDetail = {
  product_id: number; store_id: number; store_name: string; market_id: number;
  product_name: string; price: number; sale_price: number | null; category: string;
  description: string; is_sold_out: boolean; is_on_sale: boolean; image_url: string; created_at: string;
};
export async function getProduct(id: number): Promise<ProductDetail> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('잘못된 상품 ID예요.');
  let data: unknown;
  try { data = await getJson(`/products/${id}`); }
  catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400) throw new Error('잘못된 상품 ID예요.');
      if (error.status === 404) throw new Error('상품을 찾을 수 없어요.');
      if (error.status === 500) throw new Error('상품 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    throw error;
  }
  const p = data as ProductDetail | null;
  if (!p || p.product_id !== id || !Number.isInteger(p.store_id) || !Number.isInteger(p.market_id)
    || typeof p.product_name !== 'string' || typeof p.store_name !== 'string' || !Number.isFinite(p.price) || p.price < 0
    || !(p.sale_price === null || (Number.isFinite(p.sale_price) && p.sale_price >= 0))
    || typeof p.is_sold_out !== 'boolean' || typeof p.is_on_sale !== 'boolean' || typeof p.description !== 'string'
    || typeof p.image_url !== 'string' || typeof p.category !== 'string' || typeof p.created_at !== 'string') throw new Error('상품 응답 형식이 명세와 달라요.');
  return p;
}
