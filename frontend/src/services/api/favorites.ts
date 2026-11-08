import { ApiError, deleteJson, getJson, postJson } from './client';
import { getAuthSession } from './auth';

export type FavoriteItem = {
  favorite_id: string; user_id: string; listing_id: string; product_id: string;
  store_id: string; product_name: string; store_name: string; created_at: string; message: string;
};
export async function addFavorite(listingId: string, requestId?: string): Promise<FavoriteItem> {
  if (typeof listingId !== 'string' || !listingId.trim()) throw new Error('판매 게시물 ID를 확인해주세요.');
  if (requestId !== undefined && typeof requestId !== 'string') throw new Error('추천 요청 정보를 확인해주세요.');
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, '로그인 후 관심상품에 추가해주세요.');
  const body = { listing_id: listingId.trim(), ...(requestId?.trim() ? { request_id: requestId.trim() } : {}) };
  let data: unknown;
  try {
    data = await postJson('/favorites', body, session.access_token, 201);
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/favorites.ts', error);
    if (error instanceof ApiError) {
      const messages: Record<number, string> = {400:'판매 게시물 정보를 확인해주세요.',401:'로그인이 만료됐어요. 다시 로그인해주세요.',404:'판매 게시물을 찾을 수 없어요.',409:'이미 관심상품에 추가된 상품이에요.',500:'관심상품에 추가하지 못했어요. 잠시 후 다시 시도해주세요.'};
      throw new ApiError(error.status, messages[error.status] ?? '관심상품에 추가하지 못했어요. 다시 시도해주세요.');
    }
    throw error;
  }
  if (getAuthSession()?.access_token !== session.access_token) throw new Error('로그인 계정이 변경됐어요. 다시 시도해주세요.');
  const item = data as FavoriteItem | null;
  if (!item || !['favorite_id','user_id','listing_id','product_id','store_id'].every(key => typeof (item as unknown as Record<string,unknown>)[key] === 'string' && !!(item as unknown as Record<string,string>)[key].trim())
    || item.listing_id !== body.listing_id || !['product_name','store_name','message','created_at'].every(key => typeof (item as unknown as Record<string,unknown>)[key] === 'string') || !Number.isFinite(Date.parse(item.created_at))) {
    throw new Error('관심상품 추가 응답을 확인할 수 없어요.');
  }
  return item;
}

export type FavoriteCancellation = { favorite_id: string; listing_id: string; message: string };
export async function cancelFavorite(favoriteId: string, listingId: string): Promise<FavoriteCancellation> {
  if (typeof favoriteId !== 'string' || !favoriteId.trim() || typeof listingId !== 'string' || !listingId.trim()) throw new Error('관심상품 정보를 확인해주세요.');
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, '로그인 후 관심상품을 취소해주세요.');
  let data: unknown;
  try {
    data = await deleteJson(`/favorites/${encodeURIComponent(favoriteId.trim())}`, session.access_token, 200);
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/favorites.ts', error);
    if (error instanceof ApiError) {
      const messages: Record<number,string> = {401:'로그인이 만료됐어요. 다시 로그인해주세요.',403:'다른 사용자의 관심상품은 취소할 수 없어요.',404:'취소할 관심상품을 찾을 수 없어요.',500:'관심상품을 취소하지 못했어요. 잠시 후 다시 시도해주세요.'};
      throw new ApiError(error.status, messages[error.status] ?? '관심상품을 취소하지 못했어요. 다시 시도해주세요.');
    }
    throw error;
  }
  if (getAuthSession()?.access_token !== session.access_token) throw new Error('로그인 계정이 변경됐어요. 다시 시도해주세요.');
  const result = data as FavoriteCancellation | null;
  if (!result || result.favorite_id !== favoriteId.trim() || result.listing_id !== listingId.trim() || typeof result.message !== 'string') throw new Error('관심상품 취소 응답을 확인할 수 없어요.');
  return result;
}

export type FavoriteSummary = Pick<FavoriteItem, 'favorite_id' | 'listing_id' | 'product_id' | 'product_name' | 'store_id' | 'store_name' | 'created_at'>;
export type FavoriteListing = FavoriteSummary & {
  market_id: string; market_name: string; category_id: number; category: string; category_name: string;
  price: number; sale_price: number | null; is_sold_out: boolean; is_on_sale: boolean; image_url: string | null;
};
export type FavoritePage = { favorites: FavoriteListing[]; total_count: number; page: number; size: number };
export async function getFavorites(page = 1, size = 10): Promise<FavoritePage> {
  if (![page,size].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('관심상품 조회 조건을 확인해주세요.');
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, '로그인 후 관심상품을 확인해주세요.');
  let data: unknown;
  try {
    data = await getJson(`/users/me/favorites?${new URLSearchParams({page:String(page),size:String(size)})}`, session.access_token);
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/favorites.ts', error);
    if (error instanceof ApiError) {
      const messages: Record<number,string> = {400:'관심상품 조회 조건을 확인해주세요.',401:'로그인이 만료됐어요. 다시 로그인해주세요.',500:'관심상품을 불러오지 못했어요. 잠시 후 다시 시도해주세요.'};
      throw new ApiError(error.status, messages[error.status] ?? '관심상품을 불러오지 못했어요.');
    }
    throw error;
  }
  if (getAuthSession()?.access_token !== session.access_token) throw new Error('로그인 계정이 변경됐어요. 다시 시도해주세요.');
  const result = data as FavoritePage | null;
  if (!result || result.page !== page || result.size !== size || !Number.isSafeInteger(result.total_count) || result.total_count < 0 || !Array.isArray(result.favorites) || !result.favorites.every(item => item
    && ['favorite_id','listing_id','product_id','store_id','market_id'].every(key => typeof (item as unknown as Record<string,unknown>)[key] === 'string' && !!(item as unknown as Record<string,string>)[key].trim())
    && ['product_name','store_name','market_name','category','category_name','created_at'].every(key => typeof (item as unknown as Record<string,unknown>)[key] === 'string')
    && Number.isSafeInteger(item.category_id) && item.category_id > 0 && Number.isSafeInteger(item.price) && item.price >= 0
    && (item.sale_price === null || Number.isSafeInteger(item.sale_price) && item.sale_price >= 0)
    && typeof item.is_sold_out === 'boolean' && typeof item.is_on_sale === 'boolean' && (item.image_url === null || typeof item.image_url === 'string') && Number.isFinite(Date.parse(item.created_at)))) throw new Error('관심상품 목록 응답을 확인할 수 없어요.');
  return result;
}
export async function getAllFavorites(isActive: () => boolean = () => true): Promise<FavoriteListing[]> {
  const items = new Map<string,FavoriteListing>();
  for (let page = 1; isActive(); page++) {
    const result = await getFavorites(page);
    if (!isActive()) return [];
    let added = 0;
    for (const item of result.favorites) {
      if (!items.has(item.listing_id)) { items.set(item.listing_id,item); added++; }
    }
    if (page * result.size >= result.total_count) return [...items.values()];
    if (!added) throw new Error('관심상품의 다음 페이지를 불러오지 못했어요.');
  }
  return [];
}
