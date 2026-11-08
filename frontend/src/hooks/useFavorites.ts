import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { getAuthSession } from '../services/api/auth';
import { addFavorite, cancelFavorite, type FavoriteItem } from '../services/api/favorites';
import { logAppError } from '../utils/appDiagnostics';

type FavoriteState = { ids: string[]; items: FavoriteItem[]; pending: string[] };
type FavoriteOptions = { requestId?: string; preview?: boolean };
let state: FavoriteState = { ids: [], items: [], pending: [] };
let generation = 0;
let ownerToken: string | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => state;
function publish(next: FavoriteState) { state = next; listeners.forEach(listener => listener()); }
export function clearFavorites() { generation++; ownerToken = undefined; publish({ ids: [], items: [], pending: [] }); }
async function toggleFavorite(id: string, options: FavoriteOptions = {}): Promise<void> {
  if (options.preview) {
    publish({ ...state, ids: state.ids.includes(id) ? state.ids.filter(value => value !== id) : [...state.ids, id] });
    return;
  }
  const token = getAuthSession()?.access_token;
  if (ownerToken !== undefined && ownerToken !== token) clearFavorites();
  ownerToken = token;
  if (state.pending.includes(id)) return;
  const existing = state.items.find(item => item.listing_id === id);
  if (state.ids.includes(id) && !existing) { Alert.alert('관심상품', '관심상품 정보를 다시 확인해주세요.'); return; }
  const version = generation;
  publish({ ...state, pending: [...state.pending, id] });
  try {
    if (existing) {
      await cancelFavorite(existing.favorite_id, id);
      if (version !== generation || getAuthSession()?.access_token !== token) return;
      publish({ ...state, ids: state.ids.filter(value => value !== id), items: state.items.filter(value => value.favorite_id !== existing.favorite_id) });
    } else {
      const item = await addFavorite(id, options.requestId);
      if (version !== generation || getAuthSession()?.access_token !== token) return;
      publish({ ...state, ids: [...new Set([...state.ids, item.listing_id])], items: [...state.items.filter(value => value.listing_id !== item.listing_id), item] });
    }
  } catch (error) {
    logAppError(existing ? 'favorites/cancel' : 'favorites/add', error);
    if (version === generation && getAuthSession()?.access_token === token) Alert.alert('관심상품', error instanceof Error ? error.message : existing ? '관심상품을 취소하지 못했어요.' : '관심상품에 추가하지 못했어요.');
  } finally {
    if (version === generation) publish({ ...state, pending: state.pending.filter(value => value !== id) });
  }
}
export function useFavorites() {
  const selected = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { favorites: selected.ids, favoriteItems: selected.items, pendingFavorites: selected.pending, toggleFavorite };
}
