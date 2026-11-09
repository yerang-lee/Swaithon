import { ApiError, getJson, patchJson } from './client';
import { getAuthSession } from './auth';
import {
  beginUnreadLoad,
  beginUnreadRead,
  finishUnreadRead,
  receiveUnreadCount,
  type UnreadRead,
} from '../notificationUnread';

export type NotificationItem = {
  notification_id: number;
  type: string;
  title: string;
  content: string;
  related_id: number;
  is_read: boolean;
  created_at: string;
};
export type NotificationsPage = {
  notifications: NotificationItem[];
  unread_count: number;
  total_count: number;
  page: number;
  size: number;
};
export type NotificationRead = {
  notification_id: number;
  is_read: true;
  read_at: string;
  message: string;
};
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const text = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim();
const timestamp = (value: unknown) =>
  text(value) && Number.isFinite(Date.parse(value));
function session() {
  const current = getAuthSession();
  if (!current || current.expiresAt <= Date.now())
    throw new ApiError(401, '로그인 후 알림을 확인해주세요.');
  return current;
}
function translate(error: unknown): never {
  globalThis.__jangbosoLogError?.('services/api/notifications.ts', error);
  if (error instanceof ApiError) {
    const messages: Record<number, string> = {
      400: '알림 조회 조건을 확인해주세요.',
      401: '인증이 만료됐어요. 다시 로그인해주세요.',
      403: '다른 사용자의 알림은 확인할 수 없어요.',
      404: '알림을 찾을 수 없어요.',
      500: '알림을 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
    };
    throw new ApiError(error.status, messages[error.status] ?? error.message);
  }
  throw error;
}
export async function getNotifications(
  options: { page?: number; size?: number; is_read?: boolean } = {},
): Promise<NotificationsPage> {
  try {
    const current = session();
    const page = options.page ?? 1,
      size = options.size ?? 10;
    if (
      !positive(page) ||
      !positive(size) ||
      (options.is_read !== undefined && typeof options.is_read !== 'boolean')
    )
      throw new Error('알림 조회 조건을 확인해주세요.');
    const query = new URLSearchParams({
      page: String(page),
      size: String(size),
      ...(options.is_read !== undefined
        ? { is_read: String(options.is_read) }
        : {}),
    });
    const context = beginUnreadLoad(current.access_token);
    const data = (await getJson(
      `/users/me/notifications?${query}`,
      current.access_token,
    )) as NotificationsPage | null;
    if (getAuthSession()?.access_token !== current.access_token)
      throw new Error('로그인 계정이 변경됐어요. 알림을 다시 불러와주세요.');
    if (
      !data ||
      data.page !== page ||
      data.size !== size ||
      !Number.isSafeInteger(data.total_count) ||
      data.total_count < 0 ||
      !Number.isSafeInteger(data.unread_count) ||
      data.unread_count < 0 ||
      !Array.isArray(data.notifications) ||
      data.notifications.length > size ||
      !data.notifications.every(
        (item) =>
          item &&
          positive(item.notification_id) &&
          text(item.type) &&
          text(item.title) &&
          typeof item.content === 'string' &&
          positive(item.related_id) &&
          typeof item.is_read === 'boolean' &&
          timestamp(item.created_at) &&
          (options.is_read === undefined || item.is_read === options.is_read),
      )
    )
      throw new Error('알림 목록 응답을 확인할 수 없어요.');
    receiveUnreadCount(context, data.unread_count, data.notifications);
    return data;
  } catch (error) {
    return translate(error);
  }
}
export async function markNotificationRead(
  notificationId: number,
): Promise<NotificationRead> {
  let read: UnreadRead | undefined;
  let success = false;
  try {
    const current = session();
    if (!positive(notificationId)) throw new Error('알림 ID를 확인해주세요.');
    read = beginUnreadRead(current.access_token, notificationId);
    const data = (await patchJson(
      `/notifications/${notificationId}/read`,
      undefined,
      current.access_token,
      200,
    )) as NotificationRead | null;
    if (getAuthSession()?.access_token !== current.access_token)
      throw new Error('로그인 계정이 변경됐어요. 알림을 다시 불러와주세요.');
    if (
      !data ||
      data.notification_id !== notificationId ||
      data.is_read !== true ||
      !timestamp(data.read_at) ||
      !text(data.message)
    )
      throw new Error('알림 읽음 처리 결과를 확인할 수 없어요.');
    success = true;
    return data;
  } catch (error) {
    return translate(error);
  } finally {
    if (read) finishUnreadRead(read, success);
  }
}
