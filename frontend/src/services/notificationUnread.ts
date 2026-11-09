type Snapshot = {
  token?: string;
  count: number | null;
  revision: number;
  generation: number;
  pending: number;
};
export type UnreadLoad = {
  token: string;
  revision: number;
  generation: number;
  serial: number;
};
let snapshot: Snapshot = {
  count: null,
  revision: 0,
  generation: 0,
  pending: 0,
};
let serial = 0;
let readSerial = 0;
export type UnreadRead = {
  token: string;
  generation: number;
  id: number;
  notificationId: number;
  wasUnread: boolean;
};
const pendingReads = new Map<number, UnreadRead>();
const known = new Map<number, boolean>();
const confirmed = new Set<number>();
const listeners = new Set<() => void>();
export const getUnreadSnapshot = () => snapshot;
export function subscribeUnread(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}
function ensureOwner(token: string) {
  if (snapshot.token !== token) {
    pendingReads.clear();
    known.clear();
    confirmed.clear();
    publish({
      token,
      count: null,
      revision: 0,
      generation: snapshot.generation + 1,
      pending: 0,
    });
  }
}
export function beginUnreadLoad(token: string): UnreadLoad {
  ensureOwner(token);
  return {
    token,
    revision: snapshot.revision,
    generation: snapshot.generation,
    serial: ++serial,
  };
}
export function receiveUnreadCount(
  context: UnreadLoad,
  count: number,
  items: readonly { notification_id: number; is_read: boolean }[] = [],
) {
  if (
    snapshot.token !== context.token ||
    snapshot.generation !== context.generation ||
    snapshot.revision !== context.revision ||
    context.serial !== serial ||
    pendingReads.size > 0 ||
    !Number.isSafeInteger(count) ||
    count < 0
  )
    return;
  for (const item of items) known.set(item.notification_id, item.is_read);
  if (snapshot.count !== count) publish({ ...snapshot, count });
}
export function beginUnreadRead(
  token: string,
  notificationId: number,
): UnreadRead {
  ensureOwner(token);
  const context = {
    token,
    generation: snapshot.generation,
    id: ++readSerial,
    notificationId,
    wasUnread: known.get(notificationId) === false,
  };
  pendingReads.set(context.id, context);
  publish({
    ...snapshot,
    revision: snapshot.revision + 1,
    pending: pendingReads.size,
  });
  return context;
}
export function finishUnreadRead(context: UnreadRead, success: boolean) {
  if (
    snapshot.token !== context.token ||
    snapshot.generation !== context.generation ||
    !pendingReads.delete(context.id)
  )
    return;
  let count = snapshot.count;
  if (success) {
    if (
      context.wasUnread &&
      !confirmed.has(context.notificationId) &&
      count !== null
    )
      count = Math.max(0, count - 1);
    confirmed.add(context.notificationId);
    known.set(context.notificationId, true);
  }
  publish({
    ...snapshot,
    count,
    revision: snapshot.revision + 1,
    pending: pendingReads.size,
  });
}
export function hideUnreadCount(token: string) {
  if (snapshot.token === token && snapshot.count !== 0)
    publish({ ...snapshot, count: 0 });
}
