import { ApiError, getJson } from './client';
import type { ExplorationLocation } from '../explorationLocation';
// place_id는 카카오 장소 ID, market_id는 서버가 매핑한 내부 시장 ID입니다.
export type KakaoMarket = { market_id: number | null; place_id: string; market_name: string; address: string; latitude: number; longitude: number; category_name: string; place_url: string };
export type KakaoMarketSearch = { total_count: number; is_end: boolean; documents: KakaoMarket[] };
export async function searchKakaoMarkets(keyword: string): Promise<KakaoMarketSearch> {
  const query = keyword.trim();
  if (!query) throw new Error('시장 이름이나 검색어를 입력해주세요.');
  let data: unknown;
  try { data = await getJson(`/markets/search/kakao?${new URLSearchParams({ query })}`); }
  catch (error) { globalThis.__jangbosoLogError?.("services/api/markets.ts", error);
    if (error instanceof ApiError) {
      const messages: Record<number,string> = { 400: '검색어를 입력해주세요.', 500: '시장 검색 서비스를 사용할 수 없어요. 잠시 후 다시 시도해주세요.', 502: '카카오 시장 검색에 연결하지 못했어요. 다시 시도해주세요.' };
      throw new Error(messages[error.status] ?? error.message);
    }
    throw error;
  }
  const result = data as KakaoMarketSearch | null;
  if (!result || !Number.isSafeInteger(result.total_count) || result.total_count < 0 || typeof result.is_end !== 'boolean' || !Array.isArray(result.documents) || !result.documents.every(m => m && (m.market_id === null || Number.isSafeInteger(m.market_id) && m.market_id > 0) && typeof m.place_id === 'string' && !!m.place_id.trim() && ['market_name','address','category_name','place_url'].every(key => typeof (m as unknown as Record<string,unknown>)[key] === 'string') && Number.isFinite(m.latitude) && Math.abs(m.latitude) <= 90 && Number.isFinite(m.longitude) && Math.abs(m.longitude) <= 180)) throw new Error('시장 검색 응답을 확인할 수 없어요.');
  return result;
}
export type NearbyMarket = {
  market_id: number | null; market_name: string; address: string;
  latitude: number; longitude: number; distance: number; image_url: string | null;
};
function isMarket(value: unknown): value is NearbyMarket {
  if (!value || typeof value !== 'object') return false;
  const m = value as NearbyMarket;
  return (m.market_id === null || Number.isSafeInteger(m.market_id) && m.market_id > 0) && typeof m.market_name === 'string' && typeof m.address === 'string'
    && Number.isFinite(m.latitude) && Math.abs(m.latitude) <= 90 && Number.isFinite(m.longitude) && Math.abs(m.longitude) <= 180
    && Number.isFinite(m.distance) && m.distance >= 0 && (m.image_url === null || typeof m.image_url === 'string');
}
export async function getNearbyMarkets(location: ExplorationLocation): Promise<NearbyMarket[]> {
  const radius = Math.round(location.radius * 1000);
  // offset/cursor가 없는 명세에 맞춰 limit을 늘려 기본 10개 제한을 피합니다.
  let limit = 20;
  while (true) {
    const query = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), radius: String(radius), limit: String(limit) });
    let data: unknown;
    try { data = await getJson(`/markets/nearby?${query}`); }
    catch (error) { globalThis.__jangbosoLogError?.("services/api/markets.ts", error);
      if (error instanceof ApiError) {
        if (error.status === 404) return [];
        if (error.status === 400) throw new Error('위치 또는 탐색 반경을 확인해주세요.');
        if (error.status === 500) throw new Error('시장 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      }
      throw error;
    }
    if (!data || typeof data !== 'object' || !('markets' in data) || !Array.isArray(data.markets) || !data.markets.every(isMarket)) throw new Error('주변 시장 응답 형식이 명세와 달라요.');
    const markets: NearbyMarket[] = data.markets;
    if (markets.length < limit) {
      const seen = new Set<number>();
      return markets.filter(m => {
        if (m.distance > radius) return false;
        // null is not an identity: keep each unregistered place in the response.
        if (m.market_id === null) return true;
        if (seen.has(m.market_id)) return false;
        seen.add(m.market_id);
        return true;
      }).sort((a, b) => a.distance - b.distance);
    }
    if (limit >= 10240) throw new Error('검색 결과가 너무 많아요. 탐색 반경을 줄여주세요.');
    limit *= 2;
  }
}
