import { ApiError, getJson } from './client';
import { getAuthSession } from './auth';
import { resolveImageUrl } from '../../utils/imageUrl';

export type MyStoreListing = {
  listing_id: number;
  product_id: number;
  product_name: string;
  image_url: string | null;
  category_id: number | null;
  price: number;
  sale_price: number | null;
  sale_quantity: number | null;
  sale_unit: string | null;
  stock_quantity: number | null;
  is_sold_out: boolean;
  sale_rate: number | null;
  created_at: string;
};
export type MyStoreListingPage = {
  listings: MyStoreListing[];
  total_count: number;
  page: number;
  size: number;
};
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const id = (value: unknown): value is number => integer(value) && value > 0;
export async function getMyStoreListings(
  options: { page?: number; size?: number; is_sold_out?: boolean } = {},
): Promise<MyStoreListingPage> {
  try {
    const page = options.page ?? 1;
    const size = options.size ?? 10;
    if (
      !id(page) ||
      !id(size) ||
      size > 100 ||
      (options.is_sold_out !== undefined &&
        typeof options.is_sold_out !== 'boolean')
    )
      throw new Error('내 상품 목록 조회 조건을 확인해주세요.');
    const session = getAuthSession();
    if (!session || session.expiresAt <= Date.now())
      throw new ApiError(401, '다시 로그인해주세요.');
    if (session.role !== 'MERCHANT')
      throw new ApiError(403, '상인 계정에서 이용할 수 있어요.');
    const query = new URLSearchParams({
      page: String(page),
      size: String(size),
    });
    if (options.is_sold_out !== undefined)
      query.set('is_sold_out', String(options.is_sold_out));
    const result = (await getJson(
      `/stores/me/listings?${query}`,
      session.access_token,
    )) as MyStoreListingPage;
    if (getAuthSession()?.access_token !== session.access_token)
      throw new Error('로그인 계정이 변경됐어요.');
    if (
      !result ||
      result.page !== page ||
      result.size !== size ||
      !integer(result.total_count) ||
      !Array.isArray(result.listings) ||
      result.listings.length > size ||
      result.listings.length > result.total_count ||
      !result.listings.every(
        (item) =>
          item &&
          id(item.listing_id) &&
          id(item.product_id) &&
          typeof item.product_name === 'string' &&
          (item.image_url == null || typeof item.image_url === 'string') &&
          (item.category_id === null || id(item.category_id)) &&
          integer(item.price) &&
          (item.sale_price === null || integer(item.sale_price)) &&
          (item.sale_quantity === null ||
            (typeof item.sale_quantity === 'number' &&
              Number.isFinite(item.sale_quantity) &&
              item.sale_quantity >= 0)) &&
          (item.sale_unit === null || typeof item.sale_unit === 'string') &&
          (item.stock_quantity === null || integer(item.stock_quantity)) &&
          typeof item.is_sold_out === 'boolean' &&
          (options.is_sold_out === undefined ||
            item.is_sold_out === options.is_sold_out) &&
          (item.sale_rate === null ||
            (integer(item.sale_rate) && item.sale_rate <= 100)) &&
          typeof item.created_at === 'string' &&
          Number.isFinite(Date.parse(item.created_at)),
      ) ||
      new Set(result.listings.map((item) => item.listing_id)).size !==
        result.listings.length
    )
      throw new Error('내 가게 상품 목록 응답을 확인할 수 없어요.');
    return { ...result, listings: result.listings.map((item) => ({
      ...item, image_url: resolveImageUrl(item.image_url),
    })) };
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/myStoreListings.ts', error);
    const status = (error as { status?: number })?.status;
    const messages: Record<number, string> = {
      401: '로그인이 만료됐어요. 다시 로그인해주세요.',
      403: '상인 계정이 아니거나 등록된 가게가 없어요.',
      422: '내 상품 목록 조회 조건을 확인해주세요.',
      500: '내 상품 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
    };
    if (status && messages[status])
      throw new ApiError(status, messages[status]);
    throw error;
  }
}
