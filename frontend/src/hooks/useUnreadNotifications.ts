import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getAuthSession } from '../services/api/auth';
import { ApiError } from '../services/api/client';
import { getNotifications } from '../services/api/notifications';
import {
  getUnreadSnapshot,
  hideUnreadCount,
  subscribeUnread,
} from '../services/notificationUnread';
import { logAppError } from '../utils/appDiagnostics';

const requests = new Map<string, Promise<unknown>>();
export function useUnreadNotifications(enabled = true): number {
  const state = useSyncExternalStore(
    subscribeUnread,
    getUnreadSnapshot,
    getUnreadSnapshot,
  );
  const session = getAuthSession();
  const token = session?.access_token;
  const revision = state.token === token ? state.revision : 0;
  const pending = state.token === token ? state.pending : 0;
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !token || pending > 0) return;
      let focused = true;
      function refresh() {
        if (!focused || AppState.currentState !== 'active') return;
        const current = getAuthSession();
        if (
          !current ||
          current.access_token !== token ||
          current.expiresAt <= Date.now()
        ) {
          hideUnreadCount(token!);
          return;
        }
        const key = JSON.stringify([token, revision]);
        if (!requests.has(key)) {
          const request = getNotifications({ page: 1, size: 1 })
            .catch((error) => {
              logAppError('notifications/unread', error);
              if (error instanceof ApiError && error.status === 401)
                hideUnreadCount(token!);
            })
            .finally(() => {
              requests.delete(key);
            });
          requests.set(key, request);
        }
      }
      refresh();
      const timer = setInterval(refresh, 30000);
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') refresh();
      });
      return () => {
        focused = false;
        clearInterval(timer);
        listener.remove();
      };
    }, [enabled, token, revision, pending]),
  );
  return enabled &&
    session &&
    session.expiresAt > Date.now() &&
    state.token === token
    ? (state.count ?? 0)
    : 0;
}
