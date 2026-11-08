import { useEffect, useState } from 'react';
import { getNearbyMarkets } from '../services/api/markets';
import { readLocation, getCurrentLocation } from '../services/explorationLocation';
import { parseMarketDistance } from '../utils/marketDistance';
import { logAppError } from '../utils/appDiagnostics';

export function useMarketDistance(marketId: string | number | null | undefined, passedDistance?: string, preview = false): number | null {
  const passed = parseMarketDistance(passedDistance);
  const key = `${String(marketId)}:${passedDistance ?? ''}:${preview}`;
  const [resolved, setResolved] = useState<{ key: string; distance: number | null } | null>(null);
  useEffect(() => {
    if (passed !== null || preview || marketId === null || marketId === undefined || !String(marketId).trim()) return;
    let alive = true;
    void (async () => {
      try {
        const location = (await readLocation()) ?? await getCurrentLocation();
        if (!alive) return;
        const markets = await getNearbyMarkets(location);
        if (!alive) return;
        const market = markets.find(item => item.market_id !== null && String(item.market_id) === String(marketId));
        setResolved({ key, distance: market?.distance ?? null });
      } catch (error) {
        logAppError('market/distance', error);
        if (alive) setResolved({ key, distance: null });
      }
    })();
    return () => { alive = false; };
  }, [marketId, passedDistance, preview]);
  return passed ?? (resolved?.key === key ? resolved.distance : null);
}
