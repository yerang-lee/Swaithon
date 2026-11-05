import { ApiError, getJson } from './client';

export type MarketStore = { store_id: number; store_name: string; category: string; address: string; image_url: string };
export type MarketStoresPage = { stores: MarketStore[]; total_count: number; page: number; size: number };
export async function getMarketStores(marketId: number, page = 1, keyword = ''): Promise<MarketStoresPage> {
  if (!Number.isSafeInteger(marketId) || marketId <= 0 || !Number.isSafeInteger(page) || page <= 0) throw new Error('시장과 조회 조건을 확인해주세요.');
  const query = new URLSearchParams({ page: String(page), size: '10', ...(keyword.trim() ? { keyword: keyword.trim() } : {}) });
  let data: unknown;
  try { data = await getJson(`/markets/${marketId}/stores?${query}`); }
  catch (error) {
    if (error instanceof ApiError) {
      const messages: Record<number, string> = { 400: '조회 조건을 확인해주세요.', 404: '시장 정보를 찾을 수 없어요.', 500: '가게 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.' };
      throw new Error(messages[error.status] ?? error.message);
    }
    throw error;
  }
  const result = data as MarketStoresPage | null;
  if (!result || !Array.isArray(result.stores) || !Number.isSafeInteger(result.total_count) || result.total_count < 0 || result.page !== page || result.size !== 10
    || !result.stores.every(store => store && Number.isSafeInteger(store.store_id) && store.store_id > 0 && typeof store.store_name === 'string' && typeof store.category === 'string' && typeof store.address === 'string' && typeof store.image_url === 'string')) throw new Error('가게 목록 응답을 확인할 수 없어요.');
  return result;
}

export type StoreDetail = { store_id: number; store_name: string; market_id: number; market_name: string; category: string; address: string; description: string; phone: string; image_url: string };
export type StoreListing = { listing_id: string; product_id: string; store_id: string; product_name: string; price: number; sale_price: number | null; category_id: string; category: string; is_sold_out: boolean; is_on_sale: boolean; image_url: string; created_at: string };
export async function getStore(id: number): Promise<StoreDetail> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('가게 ID를 확인해주세요.');
  const data = await getJson(`/stores/${id}`) as StoreDetail;
  if (!data || data.store_id !== id || !Number.isSafeInteger(data.market_id) || !['store_name','market_name','category','address','description','phone','image_url'].every(key => typeof (data as unknown as Record<string, unknown>)[key] === 'string')) throw new Error('가게 정보 응답을 확인할 수 없어요.');
  return data;
}
export async function getStoreProducts(id: number, page: number): Promise<{ products: StoreListing[]; total_count: number; page: number; size: number }> {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(page) || page <= 0) throw new Error('조회 조건을 확인해주세요.');
  const data = await getJson(`/stores/${id}/products?page=${page}&size=10`) as { products: StoreListing[]; total_count: number; page: number; size: number };
  if (!data || data.page !== page || data.size !== 10 || !Number.isSafeInteger(data.total_count) || data.total_count < 0 || !Array.isArray(data.products) || !data.products.every(p => p && ['listing_id','product_id','store_id','product_name','category_id','category','image_url','created_at'].every(key => typeof (p as unknown as Record<string, unknown>)[key] === 'string') && Number.isFinite(p.price) && p.price >= 0 && (p.sale_price === null || Number.isFinite(p.sale_price) && p.sale_price >= 0) && typeof p.is_sold_out === 'boolean' && typeof p.is_on_sale === 'boolean')) throw new Error('상품 목록 응답을 확인할 수 없어요.');
  return data;
}
