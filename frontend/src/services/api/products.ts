import { mockRequest } from '../devMock';
import { ApiError, getJson } from './client';
import { resolveImageUrl } from '../../utils/imageUrl';
export type ProductDetail = {
  listing_id: number;
  product_id: number;
  store_id: number;
  store_name: string;
  market_id: number;
  market_name: string;
  product_name: string;
  category_id: number | null;
  price: number;
  sale_price: number | null;
  description: string | null;
  is_sold_out: boolean;
  image_url: string | null;
};
export async function getProduct(
  listingId: string,
  preview = false,
): Promise<ProductDetail> {
  if (
    typeof listingId !== 'string' ||
    !/^[1-9]\d*$/.test(listingId) ||
    !Number.isSafeInteger(Number(listingId))
  )
    throw new Error('잘못된 판매 게시물 ID예요.');
  let data: unknown;
  try {
    data = await (preview
      ? mockRequest(`/products/${encodeURIComponent(listingId)}`, 'GET')
      : getJson(`/products/${encodeURIComponent(listingId)}`));
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/products.ts', error);
    if (error instanceof ApiError) {
      if (error.status === 400) throw new Error('잘못된 상품 ID예요.');
      if (error.status === 404) throw new Error('상품을 찾을 수 없어요.');
      if (error.status === 500)
        throw new Error(
          '상품 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
        );
    }
    throw error;
  }
  const p = data as ProductDetail | null;
  const positiveId = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  const price = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (
    !p ||
    ![p.listing_id, p.product_id, p.store_id, p.market_id].every(positiveId) ||
    p.listing_id !== Number(listingId) ||
    typeof p.product_name !== 'string' ||
    typeof p.store_name !== 'string' ||
    typeof p.market_name !== 'string' ||
    !(p.category_id === null || positiveId(p.category_id)) ||
    !price(p.price) ||
    !(p.sale_price === null || price(p.sale_price)) ||
    typeof p.is_sold_out !== 'boolean' ||
    !(p.description === null || typeof p.description === 'string') ||
    !(p.image_url === null || typeof p.image_url === 'string')
  )
    throw new Error('상품 응답 형식이 명세와 달라요.');
  return { ...p, image_url: resolveImageUrl(p.image_url) };
}

export type ProductListing = {
  listing_id: number;
  product_id: number;
  store_id: number;
  store_name: string;
  market_id: number;
  product_name: string;
  category_id: number;
  category: string;
  category_name?: string;
  price: number;
  sale_price: number | null;
  is_sold_out: boolean;
  is_on_sale: boolean | null;
  image_url: string | null;
  created_at: string;
};
export type ProductPage = {
  products: ProductListing[];
  total_count: number;
  page: number;
  size: number;
};
export type ProductQuery = {
  page?: number;
  size?: number;
  keyword?: string;
  market_id?: number;
  category_id?: number;
  is_sold_out?: boolean;
  is_on_sale?: boolean;
};
export async function getProducts(
  options: ProductQuery = {},
  preview = false,
): Promise<ProductPage> {
  const page = options.page ?? 1,
    size = options.size ?? 10;
  if (
    ![
      page,
      size,
      ...(options.market_id === undefined ? [] : [options.market_id]),
      ...(options.category_id === undefined ? [] : [options.category_id]),
    ].every((n) => Number.isSafeInteger(n) && n > 0)
  )
    throw new Error('상품 조회 조건을 확인해주세요.');
  if (
    [options.is_sold_out, options.is_on_sale].some(
      (v) => v !== undefined && typeof v !== 'boolean',
    )
  )
    throw new Error('상품 필터를 확인해주세요.');
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  if (options.keyword?.trim()) query.set('keyword', options.keyword.trim());
  for (const key of [
    'market_id',
    'category_id',
    'is_sold_out',
    'is_on_sale',
  ] as const)
    if (options[key] !== undefined) query.set(key, String(options[key]));
  let result: ProductPage;
  try {
    result = (await (preview
      ? mockRequest(`/products?${query}`, 'GET')
      : getJson(`/products?${query}`))) as ProductPage;
  } catch (e) {
    globalThis.__jangbosoLogError?.('services/api/products.ts', e);
    if (e instanceof ApiError)
      throw new Error(
        e.status === 400
          ? '상품 조회 조건과 카테고리를 확인해주세요.'
          : e.status === 500
            ? '상품 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.'
            : e.message,
      );
    throw e;
  }
  if (
    !result ||
    result.page !== page ||
    result.size !== size ||
    !Number.isSafeInteger(result.total_count) ||
    result.total_count < 0 ||
    !Array.isArray(result.products) ||
    !result.products.every(
      (p) =>
        p &&
        [
          p.listing_id,
          p.product_id,
          p.store_id,
          p.market_id,
          p.category_id,
        ].every((n) => Number.isSafeInteger(n) && n > 0) &&
        typeof p.store_name === 'string' &&
        typeof p.product_name === 'string' &&
        typeof p.category === 'string' &&
        (p.category_name === undefined ||
          typeof p.category_name === 'string') &&
        Number.isSafeInteger(p.price) &&
        p.price >= 0 &&
        (p.sale_price === null ||
          (Number.isSafeInteger(p.sale_price) && p.sale_price >= 0)) &&
        typeof p.is_sold_out === 'boolean' &&
        (p.is_on_sale === null || typeof p.is_on_sale === 'boolean') &&
        (p.image_url === null || typeof p.image_url === 'string') &&
        typeof p.created_at === 'string' &&
        Number.isFinite(Date.parse(p.created_at)) &&
        (options.market_id === undefined ||
          p.market_id === options.market_id) &&
        (options.category_id === undefined ||
          p.category_id === options.category_id) &&
        (options.is_sold_out === undefined ||
          p.is_sold_out === options.is_sold_out) &&
        (options.is_on_sale === undefined ||
          p.is_on_sale === options.is_on_sale),
    )
  )
    throw new Error('상품 목록 응답을 확인할 수 없어요.');
  return { ...result, products: result.products.map((item) => ({
    ...item, image_url: resolveImageUrl(item.image_url),
  })) };
}
