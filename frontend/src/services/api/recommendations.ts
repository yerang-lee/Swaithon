import { ApiError, getJson } from './client';
import { getAuthSession } from './auth';
import { registerRecommendationRequest } from './recommendationEvents';

export type RecommendationItem = {
  rank: number;
  score: number;
  listing_id: string;
  product_id: string;
  store_id: string;
  store_name: string;
  market_id: string;
  name: string;
  category_id: string;
  price: number;
  distance_km: number;
  created_at: string;
};
export type Recommendations = {
  request_id: string;
  as_of: string;
  generated_at: string;
  rule_version: string;
  user_state: Record<string, unknown>;
  items: RecommendationItem[];
};
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim();
const date = (value: unknown) =>
  nonempty(value) && Number.isFinite(Date.parse(value));
export async function getRecommendations(
  options: { market_id?: string; top_n?: number } = {},
): Promise<Recommendations> {
  const topN = options.top_n ?? 20;
  if (
    !Number.isSafeInteger(topN) ||
    topN < 1 ||
    topN > 20 ||
    (options.market_id !== undefined && !nonempty(options.market_id))
  )
    throw new Error('추천 상품 조회 조건을 확인해주세요.');
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now())
    throw new ApiError(401, '로그인 후 추천 상품을 확인해주세요.');
  const query = new URLSearchParams({
    top_n: String(topN),
    ...(options.market_id !== undefined
      ? { market_id: options.market_id }
      : {}),
  });
  try {
    const result = (await getJson(
      `/recommendations?${query}`,
      session.access_token,
    )) as Recommendations | null;
    if (getAuthSession()?.access_token !== session.access_token)
      throw new Error(
        '로그인 계정이 변경됐어요. 추천 상품을 다시 불러와주세요.',
      );
    if (
      !result ||
      !nonempty(result.request_id) ||
      !date(result.as_of) ||
      !date(result.generated_at) ||
      !nonempty(result.rule_version) ||
      !result.user_state ||
      typeof result.user_state !== 'object' ||
      Array.isArray(result.user_state) ||
      !Array.isArray(result.items) ||
      result.items.length > topN ||
      !result.items.every(
        (item) =>
          item &&
          Number.isSafeInteger(item.rank) &&
          item.rank > 0 &&
          Number.isFinite(item.score) &&
          [
            item.listing_id,
            item.product_id,
            item.store_id,
            item.market_id,
            item.category_id,
            item.store_name,
            item.name,
          ].every(nonempty) &&
          Number.isSafeInteger(item.price) &&
          item.price >= 0 &&
          Number.isFinite(item.distance_km) &&
          item.distance_km >= 0 &&
          date(item.created_at) &&
          (options.market_id === undefined ||
            item.market_id === options.market_id),
      ) ||
      new Set(result.items.map((item) => item.listing_id)).size !==
        result.items.length
    )
      throw new Error('추천 상품 응답을 확인할 수 없어요.');
    registerRecommendationRequest(result.request_id, session.access_token);
    return {
      ...result,
      items: [...result.items].sort((a, b) => a.rank - b.rank),
    };
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/recommendations.ts', error);
    if (error instanceof ApiError) {
      const messages: Record<number, string> = {
        401: '인증이 만료됐어요. 다시 로그인해주세요.',
        404: '추천할 시장 정보를 찾을 수 없어요.',
        500: '추천 상품을 준비하지 못했어요. 잠시 후 다시 시도해주세요.',
      };
      throw new ApiError(error.status, messages[error.status] ?? error.message);
    }
    throw error;
  }
}
