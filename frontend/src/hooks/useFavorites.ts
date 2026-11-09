import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { getAuthSession } from '../services/api/auth';
import {
  addFavorite,
  cancelFavorite,
  type FavoriteSummary,
} from '../services/api/favorites';
import { logAppError } from '../utils/appDiagnostics';

type FavoriteView = Omit<
  FavoriteSummary,
  'favorite_id' | 'listing_id' | 'product_id' | 'store_id'
> & {
  favorite_id: string;
  listing_id: string;
  product_id: string;
  store_id: string;
};
function favoriteView(item: FavoriteSummary): FavoriteView {
  return {
    ...item,
    favorite_id: String(item.favorite_id),
    listing_id: String(item.listing_id),
    product_id: String(item.product_id),
    store_id: String(item.store_id),
  };
}
type FavoriteState = {
  ids: string[];
  items: FavoriteView[];
  pending: string[];
};
type FavoriteOptions = { requestId?: string; preview?: boolean };
let state: FavoriteState = { ids: [], items: [], pending: [] };
let generation = 0;
let mutationRevision = 0;
let ownerToken: string | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => state;
function publish(next: FavoriteState) {
  state = next;
  listeners.forEach((listener) => listener());
}
export function clearFavorites() {
  generation++;
  mutationRevision = 0;
  ownerToken = undefined;
  publish({ ids: [], items: [], pending: [] });
}
async function toggleFavorite(
  id: string,
  options: FavoriteOptions = {},
): Promise<void> {
  if (options.preview) {
    mutationRevision++;
    publish({
      ...state,
      ids: state.ids.includes(id)
        ? state.ids.filter((value) => value !== id)
        : [...state.ids, id],
    });
    return;
  }
  const token = getAuthSession()?.access_token;
  if (ownerToken !== undefined && ownerToken !== token) clearFavorites();
  ownerToken = token;
  if (state.pending.includes(id)) return;
  const existing = state.items.find((item) => item.listing_id === id);
  if (state.ids.includes(id) && !existing) {
    Alert.alert('관심상품', '관심상품 정보를 다시 확인해주세요.');
    return;
  }
  const version = generation;
  publish({ ...state, pending: [...state.pending, id] });
  try {
    if (existing) {
      await cancelFavorite(existing.favorite_id, id);
      if (version !== generation || getAuthSession()?.access_token !== token)
        return;
      mutationRevision++;
      publish({
        ...state,
        ids: state.ids.filter((value) => value !== id),
        items: state.items.filter(
          (value) => value.favorite_id !== existing.favorite_id,
        ),
      });
    } else {
      const added = await addFavorite(id, options.requestId);
      const item = favoriteView(added);
      if (version !== generation || getAuthSession()?.access_token !== token)
        return;
      mutationRevision++;
      publish({
        ...state,
        ids: [...new Set([...state.ids, item.listing_id])],
        items: [
          ...state.items.filter(
            (value) => value.listing_id !== item.listing_id,
          ),
          item,
        ],
      });
    }
  } catch (error) {
    logAppError(existing ? 'favorites/cancel' : 'favorites/add', error);
    if (version === generation && getAuthSession()?.access_token === token)
      Alert.alert(
        '관심상품',
        error instanceof Error
          ? error.message
          : existing
            ? '관심상품을 취소하지 못했어요.'
            : '관심상품에 추가하지 못했어요.',
      );
  } finally {
    if (version === generation)
      publish({
        ...state,
        pending: state.pending.filter((value) => value !== id),
      });
  }
}
export function useFavorites() {
  const selected = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    favorites: selected.ids,
    favoriteItems: selected.items,
    pendingFavorites: selected.pending,
    toggleFavorite,
  };
}

export function beginFavoritesLoad() {
  const token = getAuthSession()?.access_token;
  if (ownerToken !== undefined && ownerToken !== token) clearFavorites();
  ownerToken = token;
  return { token, generation, mutationRevision };
}
export function synchronizeFavorites(
  items: FavoriteSummary[],
  context: ReturnType<typeof beginFavoritesLoad>,
): boolean {
  if (
    !context.token ||
    context.token !== getAuthSession()?.access_token ||
    context.generation !== generation ||
    context.mutationRevision !== mutationRevision ||
    state.pending.length
  )
    return false;
  const normalized = items.map(favoriteView);
  const previousServerIds = new Set(state.items.map((item) => item.listing_id));
  const previewIds = state.ids.filter((id) => !previousServerIds.has(id));
  publish({
    ids: [
      ...new Set([...previewIds, ...normalized.map((item) => item.listing_id)]),
    ],
    items: normalized,
    pending: state.pending,
  });
  return true;
}
export function waitForFavoriteRequests(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted || !state.pending.length) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      if (!signal?.aborted && state.pending.length) return;
      listeners.delete(finish);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    listeners.add(finish);
    signal?.addEventListener('abort', finish, { once: true });
    finish();
  });
}
