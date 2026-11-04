import { useSyncExternalStore } from 'react';
let favorites: string[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => favorites;
export function clearFavorites() { favorites = []; listeners.forEach(listener => listener()); }
export function useFavorites() {
  const selected = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { favorites: selected, toggleFavorite: (id: string) => {
    favorites = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
    listeners.forEach(listener => listener());
  } };
}
