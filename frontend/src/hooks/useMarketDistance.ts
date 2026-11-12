import { useLocationRevision } from '../services/locationChanges';
import { useEffect, useState } from 'react';
import { getNearbyMarkets } from '../services/api/markets';
import {
  readLocation,
  getCurrentLocation,
} from '../services/explorationLocation';
import { parseMarketDistance } from '../utils/marketDistance';
import { logAppError } from '../utils/appDiagnostics';

export function useMarketDistance(
  marketId: string | number | null | undefined,
  passedDistance?: string,
): number | null {
  const revision = useLocationRevision();
  // A route can outlive its location; discard its old distance after a shared location change.
  const passed = revision === 0 ? parseMarketDistance(passedDistance) : null;
  const key = `${String(marketId)}:${passedDistance ?? ''}:${revision}`;
  const [resolved, setResolved] = useState<{
    key: string;
    distance: number | null;
  } | null>(null);
  useEffect(() => {
    if (
      passed !== null ||
      marketId === null ||
      marketId === undefined ||
      !String(marketId).trim()
    )
      return;
    let alive = true;
    void (async () => {
      try {
        const location = (await readLocation()) ?? (await getCurrentLocation());
        if (!alive) return;
        const markets = await getNearbyMarkets(location);
        if (!alive) return;
        const market = markets.find(
          (item) =>
            item.market_id !== null &&
            String(item.market_id) === String(marketId),
        );
        setResolved({ key, distance: market?.distance ?? null });
      } catch (error) {
        logAppError('market/distance', error);
        if (alive) setResolved({ key, distance: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [marketId, passedDistance, revision]);
  return passed ?? (resolved?.key === key ? resolved.distance : null);
}
