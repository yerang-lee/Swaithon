import { ApiError, getJson } from './client';
import { resolveImageUrl } from '../../utils/imageUrl';

export type MarketStore = {
  store_id: number;
  store_name: string;
  category: string | null;
  address: string | null;
  image_url: string | null;
};
export type MarketStoresPage = {
  stores: MarketStore[];
  total_count: number;
  page: number;
  size: number;
};
export async function getMarketStores(
  marketId: number,
  page = 1,
  keyword = '',
): Promise<MarketStoresPage> {
  if (
    !Number.isSafeInteger(marketId) ||
    marketId <= 0 ||
    !Number.isSafeInteger(page) ||
    page <= 0
  ) {
    throw new Error('시장과 조회 조건을 확인해주세요.');
  }

  const query = new URLSearchParams({
    page: String(page),
    size: '10',
    ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
  });

  let data: unknown;

  try {
    data = await getJson(`/markets/${marketId}/stores?${query}`);
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/stores.ts', error);

    if (error instanceof ApiError) {
      const messages: Record<number, string> = {
        400: '조회 조건을 확인해주세요.',
        404: '시장 정보를 찾을 수 없어요.',
        500: '가게 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      };

      throw new Error(messages[error.status] ?? error.message);
    }

    throw error;
  }

  const result = data as MarketStoresPage | null;

  if (
    !result ||
    !Array.isArray(result.stores) ||
    !Number.isSafeInteger(result.total_count) ||
    result.total_count < 0 ||
    result.page !== page ||
    result.size !== 10 ||
    !result.stores.every(
      (store) =>
        store &&
        Number.isSafeInteger(store.store_id) &&
        store.store_id > 0 &&
        typeof store.store_name === 'string' &&
        (store.category === null || typeof store.category === 'string') &&
        (store.address === null || typeof store.address === 'string') &&
        (store.image_url === null || typeof store.image_url === 'string'),
    )
  ) {
    throw new Error('가게 목록 응답을 확인할 수 없어요.');
  }

  return {
    ...result,
    stores: result.stores.map((store) => ({
      ...store,
      image_url: resolveImageUrl(store.image_url),
    })),
  };
}

export type StoreDetail = {
  store_id: number;
  store_name: string;
  market_id: number;
  market_name: string;
  category: string | null;
  address: string | null;
  description: string | null;
  phone: string | null;
  image_url: string | null;
};
export type StoreListing = {
  listing_id: number;
  product_id: number;
  store_id: number;
  product_name: string;
  price: number;
  sale_price: number | null;
  category_id: number;
  category?: string;
  is_sold_out: boolean;
  is_on_sale: boolean;
  image_url: string | null;
  created_at: string;
};
export async function getStore(id: number): Promise<StoreDetail> {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error('가게 ID를 확인해주세요.');
  const data = (await getJson(`/stores/${id}`)) as StoreDetail;
  if (
    !data ||
    data.store_id !== id ||
    !Number.isSafeInteger(data.market_id) ||
    !['store_name', 'market_name'].every(
      (key) =>
        typeof (data as unknown as Record<string, unknown>)[key] === 'string',
    ) ||
    !['category', 'phone', 'image_url', 'address', 'description'].every((key) => {
      const value = (data as unknown as Record<string, unknown>)[key];
      return value === null || typeof value === 'string';
    })
  )
    throw new Error('가게 정보 응답을 확인할 수 없어요.');
  return { ...data, image_url: resolveImageUrl(data.image_url) };
}
export async function getStoreProducts(
  id: number,
  page: number,
): Promise<{
  products: StoreListing[];
  total_count: number;
  page: number;
  size: number;
}> {
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(page) ||
    page <= 0
  )
    throw new Error('조회 조건을 확인해주세요.');
  const data = (await getJson(
    `/stores/${id}/products?page=${page}&size=10`,
  )) as {
    products: StoreListing[];
    total_count: number;
    page: number;
    size: number;
  };
  if (
    !data ||
    data.page !== page ||
    data.size !== 10 ||
    !Number.isSafeInteger(data.total_count) ||
    data.total_count < 0 ||
    !Array.isArray(data.products) ||
    !data.products.every(
      (p) =>
        p &&
        [p.listing_id, p.product_id, p.store_id, p.category_id].every(
          (value) => Number.isSafeInteger(value) && value > 0,
        ) &&
        typeof p.product_name === 'string' &&
        typeof p.created_at === 'string' &&
        (p.category === undefined || typeof p.category === 'string') &&
        (p.image_url === null || typeof p.image_url === 'string') &&
        Number.isFinite(p.price) &&
        p.price >= 0 &&
        (p.sale_price === null ||
          (Number.isFinite(p.sale_price) && p.sale_price >= 0)) &&
        typeof p.is_sold_out === 'boolean' &&
        typeof p.is_on_sale === 'boolean',
    )
  )
    throw new Error('상품 목록 응답을 확인할 수 없어요.');
  return { ...data, products: data.products.map((item) => ({
    ...item, image_url: resolveImageUrl(item.image_url),
  })) };
}
