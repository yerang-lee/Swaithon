import {
  useCallback,
  useEffect,
  useRef,
  type ComponentRef,
  type RefObject,
} from 'react';
import {
  AppState,
  useWindowDimensions,
  type View,
  type ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getAuthSession } from '../services/api/auth';
import {
  newRecommendationEventId,
  trackRecommendationImpressions,
  trackRecommendationView,
} from '../services/api/recommendationEvents';
import {
  isRecommendationVisible,
  type VisibleRect,
} from '../utils/recommendationVisibility';
import { logAppError } from '../utils/appDiagnostics';

type Measurable = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};
function measure(
  node: Measurable | null | undefined,
): Promise<VisibleRect | null> {
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 1000);
    try {
      node.measureInWindow((x, y, width, height) => {
        clearTimeout(timeout);
        resolve({ x, y, width, height });
      });
    } catch (error) {
      clearTimeout(timeout);
      logAppError('recommendations/visibility', error);
      resolve(null);
    }
  });
}
export function useRecommendationImpressions({
  requestId,
  items,
  ownerToken,
  enabled,
  viewportRef,
}: {
  requestId?: string;
  items: readonly { listing_id: string }[];
  ownerToken?: string;
  enabled: boolean;
  viewportRef: RefObject<Measurable | null>;
}) {
  const { width, height } = useWindowDimensions();
  const carouselRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const cards = useRef(new Map<string, ComponentRef<typeof View>>());
  const focused = useRef(false);
  const foreground = useRef(AppState.currentState === 'active');
  const frame = useRef<number | null>(null);
  const revision = useRef(0);
  const latest = useRef({ requestId, items, ownerToken, enabled });
  latest.current = { requestId, items, ownerToken, enabled };
  const checkVisibility = useCallback(() => {
    revision.current++;
    if (frame.current !== null) return;
    if (!focused.current || !foreground.current || !latest.current.enabled)
      return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const current = latest.current;
      const version = revision.current;
      const valid = () =>
        version === revision.current &&
        focused.current &&
        foreground.current &&
        latest.current.enabled &&
        latest.current.requestId === current.requestId &&
        latest.current.ownerToken === current.ownerToken &&
        getAuthSession()?.access_token === current.ownerToken;
      if (!current.requestId || !valid()) return;
      void Promise.all([
        measure(viewportRef.current),
        measure(carouselRef.current),
        ...current.items.map((item) =>
          measure(cards.current.get(item.listing_id)),
        ),
      ])
        .then(([viewport, carousel, ...rects]) => {
          if (!valid() || !viewport || !carousel) return;
          const visible = current.items.flatMap((item, index) => {
            const rect = rects[index];
            return rect &&
              isRecommendationVisible(rect, [
                viewport,
                carousel,
                { x: 0, y: 0, width, height },
              ])
              ? [{ listingId: item.listing_id, position: index + 1 }]
              : [];
          });
          if (visible.length)
            trackRecommendationImpressions(
              current.requestId!,
              visible,
              current.ownerToken,
            );
        })
        .catch((error) => logAppError('recommendations/visibility', error));
    });
  }, [width, height, viewportRef]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      checkVisibility();
      return () => {
        focused.current = false;
        revision.current++;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
      };
    }, [checkVisibility]),
  );
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      checkVisibility();
    });
    return () => listener.remove();
  }, [checkVisibility]);
  useEffect(() => {
    checkVisibility();
  }, [requestId, items, enabled, ownerToken, checkVisibility]);
  const cardRef =
    (listingId: string) => (node: ComponentRef<typeof View> | null) => {
      if (node) cards.current.set(listingId, node);
      else cards.current.delete(listingId);
      checkVisibility();
    };
  return { carouselRef, cardRef, checkVisibility };
}

export function useRecommendationView({
  requestId,
  listingId,
  ready,
}: {
  requestId?: string;
  listingId: string;
  ready: boolean;
}) {
  const owner = useRef(getAuthSession()?.access_token);
  const visit = useRef<{ key: string; id: string } | null>(null);
  const key = JSON.stringify([requestId, listingId]);
  if (visit.current?.key !== key)
    visit.current = { key, id: newRecommendationEventId('view') };
  const eventId = visit.current.id;
  useFocusEffect(
    useCallback(() => {
      if (
        !ready ||
        !requestId ||
        getAuthSession()?.access_token !== owner.current
      )
        return;
      const record = () => {
        if (
          AppState.currentState === 'active' &&
          getAuthSession()?.access_token === owner.current
        )
          trackRecommendationView(requestId, listingId, eventId, owner.current);
      };
      record();
      const listener = AppState.addEventListener('change', record);
      return () => listener.remove();
    }, [requestId, listingId, eventId, ready]),
  );
}
