import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { PageHeader } from '../components/ui/PageHeader';
import {
  getNotifications,
  markNotificationRead,
  type NotificationItem,
} from '../services/api/notifications';
import { getAuthSession } from '../services/api/auth';
import { ApiError } from '../services/api/client';
import { logAppError } from '../utils/appDiagnostics';

type Visit = {
  token?: string;
  active: boolean;
  fetching: boolean;
  reading: Set<number>;
  confirmed: Set<number>;
};
const labels: Record<string, string> = {
  RESERVATION: '픽업 예약',
  SALE: '할인',
  PRODUCT: '상품',
  SYSTEM: '공지',
};
function notificationDate(value: string) {
  const date = new Date(
    /(Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+09:00`,
  );
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingPage, setLoadingPage] = useState<number | null>(1);
  const [error, setError] = useState('');
  const [failedPage, setFailedPage] = useState(1);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [pending, setPending] = useState<number[]>([]);
  const [readErrors, setReadErrors] = useState<Record<number, string>>({});
  const visit = useRef<Visit | null>(null);
  const token = getAuthSession()?.access_token;
  const current = (owner: Visit) =>
    visit.current === owner &&
    owner.active &&
    getAuthSession()?.access_token === owner.token;
  async function load(owner: Visit, nextPage: number) {
    if (!current(owner) || owner.fetching) return;
    owner.fetching = true;
    setLoadingPage(nextPage);
    setFailedPage(nextPage);
    setError('');
    setNeedsLogin(false);
    try {
      const result = await getNotifications({ page: nextPage, size: 10 });
      if (!current(owner)) return;
      const fresh = result.notifications.map((item) =>
        owner.confirmed.has(item.notification_id)
          ? { ...item, is_read: true }
          : item,
      );
      setItems((previous) =>
        nextPage === 1
          ? fresh
          : [
              ...new Map(
                [...previous, ...fresh].map((item) => [
                  item.notification_id,
                  item,
                ]),
              ).values(),
            ],
      );
      setPage(result.page);
      setTotal(result.total_count);
    } catch (caught) {
      logAppError('notifications/list', caught);
      if (current(owner)) {
        setError(
          caught instanceof Error
            ? caught.message
            : '알림을 불러오지 못했어요.',
        );
        setNeedsLogin(caught instanceof ApiError && caught.status === 401);
      }
    } finally {
      owner.fetching = false;
      if (current(owner)) setLoadingPage(null);
    }
  }
  useFocusEffect(
    useCallback(() => {
      const owner: Visit = {
        token,
        active: true,
        fetching: false,
        reading: new Set(),
        confirmed: new Set(),
      };
      visit.current = owner;
      setItems([]);
      setPage(1);
      setTotal(0);
      setPending([]);
      setReadErrors({});
      void load(owner, 1);
      return () => {
        owner.active = false;
      };
    }, [token]),
  );
  async function read(item: NotificationItem) {
    const owner = visit.current;
    if (
      !owner ||
      !current(owner) ||
      item.is_read ||
      owner.reading.has(item.notification_id) ||
      owner.confirmed.has(item.notification_id)
    )
      return;
    owner.reading.add(item.notification_id);
    setPending([...owner.reading]);
    setReadErrors((previous) => ({ ...previous, [item.notification_id]: '' }));
    try {
      await markNotificationRead(item.notification_id);
      if (!current(owner)) return;
      owner.confirmed.add(item.notification_id);
      setItems((previous) =>
        previous.map((notification) =>
          notification.notification_id === item.notification_id
            ? { ...notification, is_read: true }
            : notification,
        ),
      );
    } catch (caught) {
      logAppError('notifications/read', caught);
      if (current(owner))
        setReadErrors((previous) => ({
          ...previous,
          [item.notification_id]:
            caught instanceof Error
              ? caught.message
              : '읽음 처리하지 못했어요. 다시 눌러주세요.',
        }));
    } finally {
      owner.reading.delete(item.notification_id);
      if (current(owner)) setPending([...owner.reading]);
    }
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader
        title="알림"
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace('/home')
        }
        rightAction={<View />}
      />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => String(item.notification_id)}
        refreshing={loadingPage === 1 && items.length > 0}
        onRefresh={() => {
          const owner = visit.current;
          if (owner) void load(owner, 1);
        }}
        ListHeaderComponent={
          error ? (
            <View style={styles.feedback}>
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const owner = visit.current;
                  if (owner) void load(owner, failedPage);
                }}
                style={styles.action}
              >
                <Text style={styles.actionText}>다시 시도</Text>
              </Pressable>
              {needsLogin && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace('/login')}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>로그인하기</Text>
                </Pressable>
              )}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          loadingPage !== null ? (
            <ActivityIndicator
              accessibilityLabel="알림 조회 중"
              color="#53B175"
              style={styles.loading}
            />
          ) : !error ? (
            <Text style={styles.empty}>알림이 없어요.</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.is_read ? '읽은 알림' : '읽지 않은 알림'}, ${item.title}`}
            accessibilityHint={item.is_read ? undefined : '눌러서 읽음 처리'}
            disabled={item.is_read || pending.includes(item.notification_id)}
            onPress={() => void read(item)}
            style={[styles.card, !item.is_read && styles.unread]}
          >
            <View style={styles.row}>
              <Text style={styles.type}>{labels[item.type] ?? '알림'}</Text>
              {!item.is_read && (
                <View accessibilityLabel="읽지 않음" style={styles.dot} />
              )}
              {pending.includes(item.notification_id) && (
                <ActivityIndicator color="#53B175" size="small" />
              )}
            </View>
            <Text style={[styles.title, !item.is_read && styles.unreadTitle]}>
              {item.title}
            </Text>
            <Text style={styles.message}>{item.content}</Text>
            <Text style={styles.date}>{notificationDate(item.created_at)}</Text>
            {!item.is_read && !!readErrors[item.notification_id] && (
              <Text accessibilityRole="alert" style={styles.error}>
                {readErrors[item.notification_id]}
              </Text>
            )}
          </Pressable>
        )}
        ListFooterComponent={
          items.length ? (
            <View style={styles.footer}>
              {loadingPage !== null && loadingPage > 1 ? (
                <ActivityIndicator
                  accessibilityLabel="알림 추가 조회 중"
                  color="#53B175"
                />
              ) : page * 10 < total && !error ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={loadingPage !== null}
                  onPress={() => {
                    const owner = visit.current;
                    if (owner) void load(owner, page + 1);
                  }}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>알림 더 보기</Text>
                </Pressable>
              ) : null}
            </View>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'white',
  },
  list: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  card: {
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9E9E9',
    marginTop: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  unread: {
    backgroundColor: '#F1F8F3',
    borderColor: '#DCEEE1',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  type: {
    fontSize: 15,
    fontWeight: '600',
    color: '#587461',
    flex: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#53B175',
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '500',
    color: '#181725',
  },
  unreadTitle: {
    fontWeight: '700',
  },
  message: {
    fontSize: 17,
    lineHeight: 26,
    color: '#555555',
  },
  date: {
    fontSize: 15,
    color: '#858585',
    marginTop: 2,
  },
  empty: {
    width: '100%',
    alignSelf: 'center',
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 26,
    color: '#858585',
    paddingVertical: 20,
  },
  loading: {
    paddingVertical: 24,
  },
  feedback: {
    paddingVertical: 20,
    gap: 8,
  },
  error: {
    fontSize: 16,
    lineHeight: 25,
    color: '#C23D3D',
  },
  action: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#317C4B',
  },
  footer: {
    paddingVertical: 20,
  },
});
