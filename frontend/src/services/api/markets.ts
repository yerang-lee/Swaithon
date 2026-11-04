import { ApiError, getJson } from './client';
import type { ExplorationLocation } from '../explorationLocation';
export type NearbyMarket = {
  market_id: number; market_name: string; address: string;
  latitude: number; longitude: number; distance: number; image_url: string;
};
function isMarket(value: unknown): value is NearbyMarket {
  if (!value || typeof value !== 'object') return false;
  const m = value as NearbyMarket;
  return Number.isInteger(m.market_id) && typeof m.market_name === 'string' && typeof m.address === 'string'
    && Number.isFinite(m.latitude) && Math.abs(m.latitude) <= 90 && Number.isFinite(m.longitude) && Math.abs(m.longitude) <= 180
    && Number.isFinite(m.distance) && m.distance >= 0 && typeof m.image_url === 'string';
}
export async function getNearbyMarkets(location: ExplorationLocation): Promise<NearbyMarket[]> {
  const radius = Math.round(location.radius * 1000);
  // offset/cursor가 없는 명세에 맞춰 limit을 늘려 기본 10개 제한을 피합니다.
  let limit = 20;
  while (true) {
    const query = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), radius: String(radius), limit: String(limit) });
    let data: unknown;
    try { data = await getJson(`/markets/nearby?${query}`); }
    catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 404) return [];
        if (error.status === 400) throw new Error('위치 또는 탐색 반경을 확인해주세요.');
        if (error.status === 500) throw new Error('시장 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      }
      throw error;
    }
    if (!data || typeof data !== 'object' || !('markets' in data) || !Array.isArray(data.markets) || !data.markets.every(isMarket)) throw new Error('주변 시장 응답 형식이 명세와 달라요.');
    const markets: NearbyMarket[] = data.markets;
    if (markets.length < limit) return [...new Map(markets.filter(m => m.distance <= radius).map(m => [m.market_id, m])).values()].sort((a, b) => a.distance - b.distance);
    if (limit >= 10240) throw new Error('검색 결과가 너무 많아요. 탐색 반경을 줄여주세요.');
    limit *= 2;
  }
}
