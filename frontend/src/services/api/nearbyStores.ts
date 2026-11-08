import type { NearbyMarket } from './markets';
import { getMarketStores, type MarketStore } from './stores';

export type NearbyStore = MarketStore & {
  market_id: number;
  market_name: string;
  market_distance: number;
};
export type NearbyStoresResult = {
  stores: NearbyStore[];
  failedMarketCount: number;
};

export async function getStoresForNearbyMarkets(
  markets: NearbyMarket[],
  isActive: () => boolean = () => true,
): Promise<NearbyStoresResult> {
  const seenMarkets = new Set<number>();
  const registered = markets.filter(
    (market): market is NearbyMarket & { market_id: number } => {
      if (market.market_id === null || seenMarkets.has(market.market_id))
        return false;
      seenMarkets.add(market.market_id);
      return true;
    },
  );
  const results: NearbyStore[][] = registered.map(() => []);
  let cursor = 0;
  let failedMarketCount = 0;
  async function worker() {
    while (isActive() && cursor < registered.length) {
      const index = cursor++;
      const market = registered[index];
      const seenStores = new Set<number>();
      try {
        for (let page = 1; isActive(); page++) {
          const result = await getMarketStores(market.market_id, page);
          if (!isActive()) return;
          let added = 0;
          for (const store of result.stores) {
            if (seenStores.has(store.store_id)) continue;
            seenStores.add(store.store_id);
            results[index].push({
              ...store,
              market_id: market.market_id,
              market_name: market.market_name,
              market_distance: market.distance,
            });
            added++;
          }
          if (page * result.size >= result.total_count) break;
          if (!added)
            throw new Error('가게 목록의 다음 페이지를 불러오지 못했어요.');
        }
      } catch (error) {
        globalThis.__jangbosoLogError?.('services/api/nearbyStores.ts', error);
        if (!isActive()) return;
        failedMarketCount++;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, registered.length) }, () => worker()),
  );
  // Preserve nearby-market order regardless of response timing; do not repeat a store.
  const seenStores = new Set<number>();
  return {
    stores: results.flat().filter((store) => {
      if (seenStores.has(store.store_id)) return false;
      seenStores.add(store.store_id);
      return true;
    }),
    failedMarketCount,
  };
}
