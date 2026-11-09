import { getNearbyMarkets } from './markets';
import { getProducts, type ProductListing } from './products';
import type { ExplorationLocation } from '../explorationLocation';

export type ClosingSaleProduct = ProductListing & {
  market_name: string;
  market_distance: number;
};

export function isClosingSaleTime(now = new Date()): boolean {
  return (now.getUTCHours() + 9) % 24 >= 16;
}

// Temporary rule: currently discounted, available listings after 16:00 KST.
// No undocumented sale-start or sale-end fields are inferred.
export async function getClosingSaleProducts(
  location: ExplorationLocation,
  isActive: () => boolean = () => true,
  now = new Date(),
): Promise<{ products: ClosingSaleProduct[]; failedMarketCount: number }> {
  if (!isClosingSaleTime(now) || !isActive())
    return { products: [], failedMarketCount: 0 };
  const nearby = await getNearbyMarkets(location);
  if (!isActive()) return { products: [], failedMarketCount: 0 };
  const markets = [
    ...new Map(
      nearby
        .filter(
          (m) => m.market_id !== null && m.distance <= location.radius * 1000,
        )
        .map((m) => [m.market_id, m]),
    ).values(),
  ];
  const results: ClosingSaleProduct[][] = markets.map(() => []);
  let cursor = 0;
  let failedMarketCount = 0;
  async function worker() {
    while (isActive() && cursor < markets.length) {
      const index = cursor++;
      const market = markets[index];
      const seen = new Set<number>();
      try {
        for (let page = 1; isActive(); page++) {
          const result = await getProducts({
            market_id: market.market_id!,
            is_on_sale: true,
            is_sold_out: false,
            page,
            size: 10,
          });
          if (!isActive()) return;
          let added = 0;
          for (const product of result.products) {
            if (seen.has(product.listing_id)) continue;
            seen.add(product.listing_id);
            added++;
            if (
              product.market_id === market.market_id &&
              product.is_on_sale === true &&
              !product.is_sold_out &&
              product.sale_price !== null &&
              product.sale_price < product.price
            ) {
              results[index].push({
                ...product,
                market_name: market.market_name,
                market_distance: market.distance,
              });
            }
          }
          if (seen.size >= result.total_count) break;
          if (!result.products.length || !added)
            throw new Error('할인 상품 목록을 끝까지 확인하지 못했어요.');
        }
      } catch (error) {
        globalThis.__jangbosoLogError?.('services/api/closingSale.ts', error);
        if (isActive()) failedMarketCount++;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, markets.length) }, () => worker()),
  );
  return {
    products: [
      ...new Map(results.flat().map((p) => [p.listing_id, p])).values(),
    ],
    failedMarketCount,
  };
}
