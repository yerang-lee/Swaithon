import { useSyncExternalStore } from 'react';
import type { ReservationItem } from './api/reservations';

let enabled = __DEV__ && process.env.EXPO_PUBLIC_MOCK_API === 'true';
const listeners = new Set<() => void>();
export function isMockMode() {
  return __DEV__ && enabled;
}
export function setMockMode(value: boolean) {
  enabled = __DEV__ && value;
  listeners.forEach((listener) => listener());
}
export function useMockMode() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isMockMode,
    isMockMode,
  );
}
export const mockLocation = {
  latitude: 37.539,
  longitude: 126.96,
  name: '용문동 (테스트)',
  radius: 3,
};
type Account = {
  user_id: number;
  phone: string;
  name: string;
  role: 'CUSTOMER' | 'MERCHANT';
  store_id?: number;
};
const accounts = new Map<string, Account>([
  [
    '01000000001',
    {
      user_id: 1,
      phone: '01000000001',
      name: '테스트 상인',
      role: 'MERCHANT',
      store_id: 101,
    },
  ],
  [
    '01000000002',
    { user_id: 2, phone: '01000000002', name: '테스트 고객', role: 'CUSTOMER' },
  ],
]);
const sessions = new Map<string, Account>();
let sequence = 100;
const mockOnboarded = new Set<number>();
const onboardingMarketIds = new Map<string, number>([
  ['mock-kakao-1', 1],
  ['mock-kakao-2', 4],
  ['mock-kakao-3', 2],
]);
let nextOnboardingMarketId = 5;
const mockFavorites = new Map<string, Map<string, Record<string, unknown>>>();
const mockRecommendationRequests = new Map<
  string,
  { owner: number; listings: Set<string> }
>();
const mockRecommendationEvents = new Map<
  string,
  { owner: number; kind: string; signature: string; recordedAt: string }
>();
type MockNotification = {
  notification_id: number;
  type: string;
  title: string;
  content: string;
  related_id: number;
  is_read: boolean;
  created_at: string;
  read_at?: string;
};
const mockNotifications = new Map<number, MockNotification[]>();
function notificationsFor(userId: number) {
  let items = mockNotifications.get(userId);
  if (!items) {
    const types = ['RESERVATION', 'SALE', 'PRODUCT', 'SYSTEM'];
    const titles = [
      '픽업 예약 상품이 준비되었습니다.',
      '찜한 상품이 할인 중입니다.',
      '상품 정보가 변경되었습니다.',
      '장보소 이용 안내',
    ];
    const contents = [
      '과일가게에서 예약하신 사과가 준비되었습니다.',
      '관심상품의 할인 가격을 확인해보세요.',
      '상품의 판매 상태가 변경되었습니다.',
      '장보소의 새로운 소식을 확인해보세요.',
    ];
    items = Array.from({ length: 12 }, (_, index) => ({
      notification_id: userId * 1000 + index + 1,
      type: types[index % 4],
      title: titles[index % 4],
      content: contents[index % 4],
      related_id: index % 4 === 0 ? 501 : 1001,
      is_read: index % 3 === 0,
      created_at: new Date(Date.now() - index * 3600000).toISOString(),
    }));
    mockNotifications.set(userId, items);
  }
  return items;
}
const mockPickupCompletions = new Map<number, string>();
const mockUsedPickupTokens = new Set<string>();
const mockCancellations = new Map<number, Set<number>>();
const mockPickupQr = new Map<
  number,
  Map<number, { data: string; expiresAt: number }>
>();
function reservationBase(userId: number) {
  return userId === 2 ? 501 : userId * 1000 + 501;
}
type MockReservation = ReservationItem & { listing_id: number };
const mockCreatedReservations = new Map<number, MockReservation[]>();
function mockReservationItems(userId: number): MockReservation[] {
  const cancelled = mockCancellations.get(userId) ?? new Set<number>();
  const states = [
    'READY',
    'COMPLETED',
    'PENDING',
    'CANCELLED',
    'CONFIRMED',
  ] as const;
  const base = reservationBase(userId);
  const fixed = Array.from({ length: 14 }, (_, index) => ({
    reservation_id: base + index,
    listing_id: 1001 + index,
    product_id: 101 + index,
    product_name: ['햇사과', '당근', '배'][index % 3],
    store_id: index === 0 ? 101 : 10,
    store_name: '행복청과',
    market_id: 1,
    market_name: '용산용문시장',
    quantity: (index % 2) + 1,
    unit_price: 5000,
    total_price: 5000 * ((index % 2) + 1),
    pickup_at: `2026-11-${String(13 - Math.floor(index / 3)).padStart(2, '0')}T14:00:00`,
    status: cancelled.has(base + index)
      ? ('CANCELLED' as const)
      : states[index % 5],
    created_at: '2026-11-06T10:00:00',
  }));
  return [...(mockCreatedReservations.get(userId) ?? []), ...fixed].map(
    (item) =>
      cancelled.has(item.reservation_id)
        ? { ...item, status: 'CANCELLED' }
        : mockPickupCompletions.has(item.reservation_id)
          ? { ...item, status: 'COMPLETED' }
          : item,
  );
}
function mockReservationOwner(id: number) {
  return [...accounts.values()].find((user) =>
    mockReservationItems(user.user_id).some(
      (item) => item.reservation_id === id,
    ),
  );
}
// 테스트 입장 버튼은 이전 정보 수정/탈퇴에 영향을 받지 않는 새 예시 계정을 준비합니다.
export function prepareMockAccount(role: Account['role']): string {
  if (!isMockMode())
    throw new Error('개발용 테스트 모드에서만 사용할 수 있어요.');
  const userId = role === 'MERCHANT' ? 1 : 2;
  const phone = role === 'MERCHANT' ? '01000000001' : '01000000002';
  for (const [key, account] of accounts)
    if (account.user_id === userId) accounts.delete(key);
  for (const [key, account] of sessions)
    if (account.user_id === userId || account.phone === phone)
      sessions.delete(key);
  for (const item of mockReservationItems(userId))
    mockPickupCompletions.delete(item.reservation_id);
  for (const qr of mockPickupQr.get(userId)?.values() ?? [])
    mockUsedPickupTokens.delete(qr.data);
  mockCancellations.delete(userId);
  mockPickupQr.delete(userId);
  mockCreatedReservations.delete(userId);
  mockNotifications.delete(userId);
  mockOnboarded.delete(userId);
  accounts.set(phone, {
    user_id: userId,
    phone,
    name: role === 'MERCHANT' ? '테스트 상인' : '테스트 고객',
    role,
    ...(role === 'MERCHANT' ? { store_id: 101 } : {}),
  });
  return phone;
}
export async function mockRequest(
  path: string,
  method: string,
  body?: unknown,
  token?: string,
): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const url = new URL(path, 'https://mock.invalid');
  const input = (body ?? {}) as Record<string, unknown>;
  const account = token ? sessions.get(token) : undefined;

  if (url.pathname === '/users/me/notifications' && method === 'GET') {
    const fail = (status: number) => {
      throw Object.assign(new Error('알림 요청을 처리하지 못했어요.'), {
        status,
      });
    };
    if (!account) return fail(401);
    const page = Number(url.searchParams.get('page') ?? 1),
      size = Number(url.searchParams.get('size') ?? 10);
    const filter = url.searchParams.get('is_read');
    if (
      ![page, size].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      (filter !== null && filter !== 'true' && filter !== 'false')
    )
      return fail(400);
    const all = notificationsFor(account.user_id);
    const filtered = all.filter(
      (item) => filter === null || item.is_read === (filter === 'true'),
    );
    return {
      notifications: filtered
        .slice((page - 1) * size, page * size)
        .map(({ read_at, ...item }) => ({ ...item })),
      unread_count: all.filter((item) => !item.is_read).length,
      total_count: filtered.length,
      page,
      size,
    };
  }
  const notificationRead = url.pathname.match(/^\/notifications\/(\d+)\/read$/);
  if (notificationRead && method === 'PATCH') {
    const fail = (status: number) => {
      throw Object.assign(new Error('알림 읽음 요청을 처리하지 못했어요.'), {
        status,
      });
    };
    if (!account) return fail(401);
    const id = Number(notificationRead[1]),
      ownerId = Math.floor(id / 1000);
    if (![...accounts.values()].some((user) => user.user_id === ownerId))
      return fail(404);
    const item = notificationsFor(ownerId).find(
      (item) => item.notification_id === id,
    );
    if (!item) return fail(404);
    if (ownerId !== account.user_id) return fail(403);
    item.is_read = true;
    item.read_at ??= new Date().toISOString();
    return {
      notification_id: id,
      is_read: true,
      read_at: item.read_at,
      message: '알림을 읽음 처리했습니다.',
    };
  }
  if (url.pathname === '/users/me/favorites' && method === 'GET') {
    if (!account || !token)
      throw new Error('로그인 후 관심상품을 확인해주세요.');
    const page = Number(url.searchParams.get('page') ?? 1),
      size = Number(url.searchParams.get('size') ?? 10);
    if (
      ![page, size].every((value) => Number.isSafeInteger(value) && value > 0)
    )
      throw new Error('관심상품 조회 조건을 확인해주세요.');
    const items = [...(mockFavorites.get(token)?.values() ?? [])]
      .filter((item) => item.is_active !== false)
      .map((item) => ({
        favorite_id: item.favorite_id,
        listing_id: item.listing_id,
        product_id: item.product_id,
        product_name: item.product_name,
        store_id: item.store_id,
        store_name: item.store_name,
        market_id: 1,
        market_name: '용산용문시장',
        category_id: 2,
        category: 2,
        category_name: '과일',
        price: 5000,
        sale_price: null,
        is_sold_out: false,
        is_on_sale: false,
        image_url: null,
        created_at: item.created_at,
      }));
    return {
      favorites: items.slice((page - 1) * size, page * size),
      total_count: items.length,
      page,
      size,
    };
  }
  const favoriteCancelMatch = url.pathname.match(/^\/favorites\/([^/]+)$/);
  if (favoriteCancelMatch && method === 'DELETE') {
    if (!account) throw new Error('로그인 후 관심상품을 취소해주세요.');
    const favoriteId = decodeURIComponent(favoriteCancelMatch[1]);
    for (const saved of mockFavorites.values()) {
      for (const [listingId, item] of saved) {
        if (String(item.favorite_id) !== favoriteId || item.is_active === false)
          continue;
        if (item.user_id !== account.user_id)
          throw new Error('다른 사용자의 관심상품은 취소할 수 없어요.');
        item.is_active = false;
        item.updated_at = new Date().toISOString();
        return {
          favorite_id: item.favorite_id,
          listing_id: item.listing_id,
          message: '찜이 취소되었습니다.',
        };
      }
    }
    throw new Error('취소할 관심상품을 찾을 수 없어요.');
  }
  if (url.pathname === '/favorites' && method === 'POST') {
    if (!account || !token)
      throw new Error('로그인 후 관심상품에 추가해주세요.');
    if (
      typeof input.listing_id !== 'number' ||
      !Number.isSafeInteger(input.listing_id) ||
      input.listing_id <= 0 ||
      (input.request_id !== undefined && typeof input.request_id !== 'string')
    )
      throw new Error('판매 게시물 정보를 확인해주세요.');
    const saved =
      mockFavorites.get(token) ?? new Map<string, Record<string, unknown>>();
    if (
      [...saved.values()].some(
        (item) =>
          item.listing_id === input.listing_id && item.is_active !== false,
      )
    )
      throw new Error('이미 관심상품에 추가된 상품이에요.');
    const item = {
      favorite_id: ++sequence,
      user_id: account.user_id,
      listing_id: input.listing_id,
      product_id: 101,
      store_id: 101,
      product_name: '테스트 상품',
      store_name: '테스트 가게',
      created_at: new Date().toISOString(),
      is_active: true,
      message: '상품이 찜 목록에 추가되었습니다.',
    };
    saved.set(String(item.favorite_id), item);
    mockFavorites.set(token, saved);
    return item;
  }
  if (url.pathname === '/reservations' && method === 'POST') {
    const fail = (status: number) => {
      throw Object.assign(new Error('예약 요청을 처리하지 못했어요.'), {
        status,
      });
    };
    if (!account) return fail(401);
    if (
      typeof input.listing_id !== 'number' ||
      !Number.isSafeInteger(input.listing_id) ||
      Number(input.listing_id) <= 0 ||
      typeof input.product_id !== 'number' ||
      !Number.isSafeInteger(input.product_id) ||
      Number(input.product_id) <= 0 ||
      typeof input.quantity !== 'number' ||
      !Number.isSafeInteger(input.quantity) ||
      input.quantity <= 0 ||
      typeof input.pickup_at !== 'string' ||
      !Number.isFinite(Date.parse(input.pickup_at)) ||
      Date.parse(input.pickup_at) <= Date.now()
    )
      return fail(400);
    const product = (await mockRequest(
      `/products/${encodeURIComponent(input.listing_id)}`,
      'GET',
    )) as {
      listing_id: number;
      product_id: number;
      store_id: number;
      store_name: string;
      market_id: number;
      product_name: string;
      price: number;
      sale_price: number | null;
      is_on_sale: boolean;
      is_sold_out: boolean;
    };
    if (product.product_id !== input.product_id) return fail(400);
    if (product.is_sold_out) return fail(409);
    const price =
      product.is_on_sale && product.sale_price !== null
        ? product.sale_price
        : product.price;
    const reservation: MockReservation = {
      reservation_id: 10000 + ++sequence,
      listing_id: product.listing_id,
      product_id: product.product_id,
      product_name: product.product_name,
      store_id: product.store_id,
      store_name: product.store_name,
      market_id: product.market_id,
      market_name: product.market_id === 1 ? '용산용문시장' : '테스트 시장',
      quantity: input.quantity,
      unit_price: price,
      total_price: price * input.quantity,
      pickup_at: input.pickup_at,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };
    mockCreatedReservations.set(account.user_id, [
      reservation,
      ...(mockCreatedReservations.get(account.user_id) ?? []),
    ]);
    return {
      ...reservation,
      user_id: account.user_id,
      request_note:
        typeof input.request_note === 'string' ? input.request_note : null,
      message: '예약이 완료되었습니다.',
    };
  }
  if (
    url.pathname === '/users/me/reservations' &&
    method === 'GET' &&
    account
  ) {
    const all = mockReservationItems(account.user_id).filter(
      (item) =>
        !url.searchParams.get('status') ||
        item.status === url.searchParams.get('status'),
    );
    const page = Number(url.searchParams.get('page') ?? 1),
      size = Number(url.searchParams.get('size') ?? 10);
    return {
      reservations: all
        .slice((page - 1) * size, page * size)
        .map(({ listing_id, ...item }) => item),
      total_count: all.length,
      page,
      size,
    };
  }
  if (url.pathname === '/reservations/pickup/verify' && method === 'POST') {
    const fail = (status: number) => {
      throw Object.assign(new Error('픽업 QR 검증에 실패했어요.'), { status });
    };
    if (!account) return fail(401);
    if (account.role !== 'MERCHANT') return fail(403);
    if (typeof input.qr_code_data !== 'string' || !input.qr_code_data.trim())
      return fail(400);
    if (mockUsedPickupTokens.has(input.qr_code_data)) return fail(410);
    let found: { ownerId: number; id: number; expiresAt: number } | undefined;
    for (const [ownerId, tokens] of mockPickupQr) {
      for (const [id, qr] of tokens) {
        if (qr.data === input.qr_code_data)
          found = { ownerId, id, expiresAt: qr.expiresAt };
      }
    }
    if (!found) return fail(404);
    const item = mockReservationItems(found.ownerId).find(
      (item) => item.reservation_id === found.id,
    );
    if (!item) return fail(404);
    if (item.store_id !== account.store_id) return fail(403);
    if (found.expiresAt <= Date.now()) return fail(410);
    if (item.status !== 'READY') return fail(409);
    const completedAt = new Date().toISOString();
    // 검증과 상태 갱신 사이 await가 없어 테스트 서버에서도 한 요청만 성공합니다.
    mockPickupCompletions.set(item.reservation_id, completedAt);
    mockUsedPickupTokens.add(input.qr_code_data);
    return {
      reservation_id: item.reservation_id,
      listing_id: item.listing_id,
      product_id: item.product_id,
      product_name: item.product_name,
      store_name: item.store_name,
      status: 'COMPLETED',
      completed_at: completedAt,
      message: '픽업이 완료 처리되었습니다.',
    };
  }
  const detailMatch = url.pathname.match(/^\/reservations\/(\d+)$/);
  if (detailMatch && method === 'GET') {
    const fail = (status: number) => {
      throw Object.assign(new Error('예약 상세를 확인할 수 없어요.'), {
        status,
      });
    };
    if (!account) return fail(401);
    const id = Number(detailMatch[1]),
      owner = mockReservationOwner(id);
    if (!owner) return fail(404);
    if (owner.user_id !== account.user_id) return fail(403);
    const item = mockReservationItems(account.user_id).find(
      (item) => item.reservation_id === id,
    )!;
    let qr: { data: string; expiresAt: number } | undefined;
    const saved =
      mockPickupQr.get(account.user_id) ??
      new Map<number, { data: string; expiresAt: number }>();
    if (item.status === 'READY') {
      qr = saved.get(id);
      if (!qr || qr.expiresAt <= Date.now()) {
        qr = {
          data: `TEST_ONLY_PICKUP_${account.user_id}_${id}_${++sequence}_${Date.now()}`,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };
        saved.set(id, qr);
        mockPickupQr.set(account.user_id, saved);
      }
    } else saved.delete(id);
    return {
      reservation_id: id,
      listing_id: item.listing_id,
      product_id: item.product_id,
      product_name: item.product_name,
      store_id: item.store_id,
      store_name: item.store_name,
      quantity: item.quantity,
      total_price: item.total_price,
      status: item.status,
      created_at: item.created_at,
      qr_code_data: qr?.data ?? null,
      qr_code_expires_at: qr ? new Date(qr.expiresAt).toISOString() : null,
    };
  }
  const cancelMatch = url.pathname.match(/^\/reservations\/(\d+)\/cancel$/);
  if (cancelMatch && method === 'PATCH' && account) {
    const id = Number(cancelMatch[1]),
      owner = mockReservationOwner(id);
    if (!owner)
      throw Object.assign(new Error('예약을 찾을 수 없어요.'), { status: 404 });
    if (owner.user_id !== account.user_id)
      throw Object.assign(new Error('본인의 예약만 취소할 수 있어요.'), {
        status: 403,
      });
    const item = mockReservationItems(account.user_id).find(
      (item) => item.reservation_id === id,
    )!;
    if (item.status === 'COMPLETED' || item.status === 'CANCELLED')
      throw new Error('현재 상태에서는 취소할 수 없어요.');
    const cancelled =
      mockCancellations.get(account.user_id) ?? new Set<number>();
    cancelled.add(id);
    mockCancellations.set(account.user_id, cancelled);
    mockPickupQr.get(account.user_id)?.delete(id);
    return {
      reservation_id: id,
      status: 'CANCELLED',
      cancelled_at: new Date().toISOString(),
      message: '예약이 취소되었습니다.',
    };
  }
  if (method === 'POST' && url.pathname === '/auth/signup') {
    const phone = String(input.phone);
    if (accounts.has(phone))
      throw new Error('이미 가입된 테스트 전화번호예요.');
    const created: Account = {
      user_id: ++sequence,
      phone,
      name: String(input.name),
      role: 'CUSTOMER',
    };
    accounts.set(phone, created);
    return { ...created, created_at: new Date().toISOString() };
  }
  if (method === 'POST' && url.pathname === '/auth/login') {
    const user = accounts.get(String(input.phone));
    if (!user)
      throw new Error(
        '테스트 계정으로 가입하거나 테스트 입장 버튼을 사용해주세요.',
      );
    const access = `mock-only-${++sequence}`;
    sessions.set(access, user);
    return {
      access_token: access,
      refresh_token: 'mock-only-refresh',
      token_type: 'bearer',
      expires_in: 86400,
    };
  }
  if (method === 'POST' && url.pathname === '/auth/logout') {
    if (token) sessions.delete(token);
    return { message: '로그아웃되었습니다.' };
  }
  if (url.pathname === '/users/me' && method === 'GET' && account)
    return { ...account };
  if (url.pathname === '/users/me' && method === 'PATCH' && account) {
    const phone =
      input.phone === undefined ? account.phone : String(input.phone);
    if (accounts.has(phone) && accounts.get(phone) !== account)
      throw new Error('이미 가입된 전화번호예요.');
    accounts.delete(account.phone);
    account.phone = phone;
    if (input.name !== undefined) account.name = String(input.name);
    accounts.set(phone, account);
    return {
      user_id: account.user_id,
      name: account.name,
      phone: account.phone,
    };
  }
  if (url.pathname === '/users/me' && method === 'DELETE' && account) {
    accounts.delete(account.phone);
    for (const [key, value] of sessions)
      if (value.user_id === account.user_id) sessions.delete(key);
    return { message: '회원 탈퇴가 완료되었습니다.' };
  }

  if (
    url.pathname === '/users/me/onboarding' &&
    method === 'PATCH' &&
    account
  ) {
    if (mockOnboarded.has(account.user_id))
      throw Object.assign(new Error('이미 온보딩이 완료된 계정이에요.'), {
        status: 409,
      });
    if (input.role !== 'MERCHANT' && input.role !== 'CUSTOMER')
      throw Object.assign(new Error('이용 유형을 확인해주세요.'), {
        status: 400,
      });
    if (
      input.role === 'MERCHANT' &&
      (!['kakao_place_id', 'market_name', 'address', 'store_name'].every(
        (key) => typeof input[key] === 'string' && String(input[key]).trim(),
      ) ||
        typeof input.latitude !== 'number' ||
        !Number.isFinite(input.latitude) ||
        Math.abs(input.latitude) > 90 ||
        typeof input.longitude !== 'number' ||
        !Number.isFinite(input.longitude) ||
        Math.abs(input.longitude) > 180)
    )
      throw Object.assign(new Error('상인 필수 정보를 확인해주세요.'), {
        status: 400,
      });
    account.role = input.role;
    mockOnboarded.add(account.user_id);
    if (input.role === 'CUSTOMER')
      return {
        user_id: account.user_id,
        role: 'CUSTOMER',
        market_id: null,
        store_id: null,
        store_name: null,
        onboarding_completed: true,
      };
    const place = String(input.kakao_place_id);
    if (!onboardingMarketIds.has(place))
      onboardingMarketIds.set(place, nextOnboardingMarketId++);
    return {
      user_id: account.user_id,
      role: 'MERCHANT',
      market_id: onboardingMarketIds.get(place),
      store_id: (account.store_id = ++sequence),
      store_name: String(input.store_name).trim(),
      onboarding_completed: true,
    };
  }
  if (
    method === 'POST' &&
    [
      '/recommendations/events/impressions',
      '/recommendations/events/views',
    ].includes(url.pathname)
  ) {
    const fail = (status: number) => {
      throw Object.assign(new Error('추천 기록 요청을 처리하지 못했어요.'), {
        status,
      });
    };
    if (!account) return fail(401);
    const request = mockRecommendationRequests.get(String(input.request_id));
    if (!request || request.owner !== account.user_id) return fail(404);
    const kind = url.pathname.endsWith('/views') ? 'view' : 'impression';
    const events =
      kind === 'view'
        ? [input]
        : Array.isArray(input.events)
          ? (input.events as Record<string, unknown>[])
          : [];
    if (!events.length) return fail(400);
    const staged: Array<{ id: string; signature: string; duplicate: boolean }> =
      [];
    const incoming = new Map<string, string>();
    for (const event of events) {
      if (
        !event ||
        typeof event.event_id !== 'string' ||
        !event.event_id.trim() ||
        typeof event.listing_id !== 'string' ||
        !event.listing_id.trim() ||
        typeof event.occurred_at !== 'string' ||
        !Number.isFinite(Date.parse(event.occurred_at)) ||
        (kind === 'impression' &&
          (typeof event.position !== 'number' ||
            !Number.isSafeInteger(event.position) ||
            event.position <= 0))
      )
        return fail(400);
      if (!request.listings.has(event.listing_id)) return fail(404);
      const signature = JSON.stringify([
        input.request_id,
        event.listing_id,
        event.occurred_at,
        kind === 'impression' ? event.position : null,
      ]);
      const old = mockRecommendationEvents.get(event.event_id);
      if (
        (old &&
          (old.owner !== account.user_id ||
            old.kind !== kind ||
            old.signature !== signature)) ||
        (incoming.has(event.event_id) &&
          incoming.get(event.event_id) !== signature)
      )
        return fail(409);
      staged.push({
        id: event.event_id,
        signature,
        duplicate: !!old || incoming.has(event.event_id),
      });
      incoming.set(event.event_id, signature);
    }
    const now = new Date().toISOString();
    for (const event of staged)
      if (!event.duplicate)
        mockRecommendationEvents.set(event.id, {
          owner: account.user_id,
          kind,
          signature: event.signature,
          recordedAt: now,
        });
    if (kind === 'view')
      return {
        event_id: input.event_id,
        listing_id: input.listing_id,
        event_type: 'VIEW',
        recorded_at: mockRecommendationEvents.get(String(input.event_id))!
          .recordedAt,
        message: '상품 상세 조회 기록이 저장되었습니다.',
      };
    const duplicates = staged.filter((event) => event.duplicate).length;
    return {
      request_id: input.request_id,
      recorded_count: staged.length - duplicates,
      duplicate_count: duplicates,
      message: '상품 노출 기록이 저장되었습니다.',
    };
  }
  if (url.pathname === '/recommendations' && method === 'GET') {
    if (!account) throw new Error('로그인 후 추천 상품을 확인해주세요.');
    const marketId = url.searchParams.get('market_id');
    const topN = Number(url.searchParams.get('top_n') ?? 20);
    const latitude = url.searchParams.get('latitude');
    const longitude = url.searchParams.get('longitude');
    if (
      latitude === null ||
      longitude === null ||
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(Number(latitude)) ||
      Math.abs(Number(latitude)) > 90 ||
      !Number.isFinite(Number(longitude)) ||
      Math.abs(Number(longitude)) > 180 ||
      !Number.isSafeInteger(topN) ||
      topN < 1 ||
      topN > 20 ||
      (marketId !== null &&
        (!/^[1-9]\d*$/.test(marketId) ||
          !Number.isSafeInteger(Number(marketId))))
    )
      throw Object.assign(new Error('추천 조회 조건을 확인해주세요.'), {
        status: 400,
      });
    const result = (await mockRequest(
      `/products?page=1&size=${topN}${marketId ? `&market_id=${encodeURIComponent(marketId)}` : ''}`,
      'GET',
    )) as { products: Array<Record<string, unknown>> };
    const now = new Date().toISOString();
    const requestId = `mock-rec-${++sequence}`;
    mockRecommendationRequests.set(requestId, {
      owner: account.user_id,
      listings: new Set(
        result.products.map((product) => String(product.listing_id)),
      ),
    });
    return {
      request_id: requestId,
      as_of: now,
      generated_at: now,
      recommendation_type: 'rule',
      model_version: null,
      user_state: 'new_no_interest',
      items: result.products.map((product, index) => ({
        rank: index + 1,
        score: 1 - index / 100,
        listing_id: String(product.listing_id),
        product_id: String(product.product_id),
        store_id: String(product.store_id),
        store_name: product.store_name,
        market_id: String(product.market_id),
        name: product.product_name,
        category_id: String(product.category_id),
        price: product.sale_price ?? product.price,
        distance_km: 0.3 + index / 10,
        created_at: product.created_at,
      })),
    };
  }
  // Numeric category IDs below are test fixtures, not production mappings.
  const historyMatch = url.pathname.match(
    /^\/products\/([1-9]\d*)\/price-history$/,
  );
  if (historyMatch && method === 'GET') {
    if (!account || !token) throw new Error('로그인 후 확인해주세요.');
    const product = (await mockRequest(
      `/products/${historyMatch[1]}`,
      'GET',
      undefined,
      token,
    )) as Record<string, any>;
    const current =
      product.is_on_sale && product.sale_price !== null
        ? product.sale_price
        : product.price;
    return {
      listing_id: Number(historyMatch[1]),
      product_id: product.product_id,
      product_name: product.product_name,
      store_id: product.store_id,
      store_name: product.store_name,
      current_price: current,
      price_history: [30, 20, 7, 2, 0].map((days, i) => ({
        price: Math.round(current * [1.2, 1.1, 1.15, 1.05, 1][i]),
        recorded_at: new Date(Date.now() - days * 86400000).toISOString(),
      })),
    };
  }
  if (
    (url.pathname === '/products' && method === 'GET') ||
    (/^\/products\/\d+$/.test(url.pathname) && method === 'GET')
  ) {
    const categoryNames = [
      '채소',
      '과일',
      '정육·계란',
      '수산물',
      '반찬',
      '가공식품',
      '곡물·견과',
      '떡·베이커리',
      '기타',
    ];
    const categoryCodes = [
      'VEGETABLE',
      'FRUIT',
      'MEAT_EGGS',
      'SEAFOOD',
      'SIDE_DISH',
      'PROCESSED_FOOD',
      'GRAINS_NUTS',
      'RICE_CAKE_BAKERY',
      'OTHER',
    ];
    const all = Array.from({ length: 36 }, (_, i) => ({
      listing_id: 1001 + i,
      product_id: 1 + i,
      store_id: 101 + (i % 6),
      store_name: ['행복청과', '싱싱야채', '우리정육'][i % 3],
      market_id: i < 27 ? 1 : 2,
      product_name: [
        '당근',
        '사과',
        '계란',
        '고등어',
        '김치',
        '두부',
        '쌀',
        '빵',
        '기타 상품',
      ][i % 9],
      category_id: (i % 9) + 1,
      category: categoryCodes[i % 9],
      category_name: categoryNames[i % 9],
      price: 5000 + i * 100,
      sale_price: i % 3 === 0 ? 4000 + i * 100 : null,
      is_sold_out: i % 7 === 0,
      is_on_sale: i % 3 === 0,
      image_url: null,
      created_at: new Date(
        Date.UTC(2026, 10, 6, 12, 0) - i * 60000,
      ).toISOString(),
    }));
    if (url.pathname !== '/products') {
      const product = all.find(
        (p) => String(p.listing_id) === url.pathname.split('/').pop(),
      );
      if (!product) throw new Error('상품을 찾을 수 없어요.');
      return {
        ...product,
        image_url: '',
        description: '화면 확인용 예시 상품입니다.',
      };
    }
    const filtered = all.filter(
      (p) =>
        (!url.searchParams.has('market_id') ||
          p.market_id === Number(url.searchParams.get('market_id'))) &&
        (!url.searchParams.has('category_id') ||
          p.category_id === Number(url.searchParams.get('category_id'))) &&
        (!url.searchParams.has('is_sold_out') ||
          p.is_sold_out === (url.searchParams.get('is_sold_out') === 'true')) &&
        (!url.searchParams.has('is_on_sale') ||
          p.is_on_sale === (url.searchParams.get('is_on_sale') === 'true')) &&
        p.product_name.includes(url.searchParams.get('keyword') ?? ''),
    );
    const page = Number(url.searchParams.get('page') ?? 1),
      size = Number(url.searchParams.get('size') ?? 10);
    return {
      products: filtered.slice((page - 1) * size, page * size),
      total_count: filtered.length,
      page,
      size,
    };
  }
  if (url.pathname === '/markets/search/kakao' && method === 'GET') {
    const query = (url.searchParams.get('query') ?? '').trim();
    if (!query) throw new Error('검색어를 입력해주세요.');
    const documents = [
      {
        market_name: '용산용문시장',
        address: '서울 용산구 효창원로42길',
        latitude: 37.539,
        longitude: 126.96,
      },
      {
        market_name: '망원시장',
        address: '서울 마포구 포은로8길 14',
        latitude: 37.5563,
        longitude: 126.9102,
      },
      {
        market_name: '공덕시장',
        address: '서울 마포구 공덕동',
        latitude: 37.544,
        longitude: 126.953,
      },
      {
        market_name: '미등록시장',
        address: '서울 테스트 주소',
        latitude: 37.55,
        longitude: 126.95,
      },
    ]
      .map((m, i) => ({
        ...m,
        place_id: `mock-kakao-${i + 1}`,
        market_id: [1, 4, 2, null][i],
        category_name: '가정,생활 > 시장',
        place_url: '',
      }))
      .filter(
        (m) => m.market_name.includes(query) || m.address.includes(query),
      );
    return { documents, total_count: documents.length, is_end: true };
  }
  if (url.pathname === '/markets/nearby' && method === 'GET') {
    const lat = Number(url.searchParams.get('latitude')),
      lng = Number(url.searchParams.get('longitude'));
    const radius = Number(url.searchParams.get('radius'));
    return {
      markets: ['용산용문시장', '공덕시장', '만리시장']
        .map((name, index) => ({
          market_id: index + 1,
          market_name: name,
          address: '테스트 시장 주소',
          latitude: lat,
          longitude: lng,
          distance: (index + 1) * 250,
          image_url: '',
        }))
        .filter((m) => m.distance <= radius),
    };
  }
  const match = url.pathname.match(/^\/markets\/(\d+)\/stores$/);
  if (match && method === 'GET') {
    const keyword = url.searchParams.get('keyword') ?? '';
    const page = Number(url.searchParams.get('page') ?? 1),
      size = Number(url.searchParams.get('size') ?? 10);
    const stores = Array.from({ length: 24 }, (_, index) => ({
      store_id: Number(match[1]) * 100 + index + 1,
      store_name: `${['행복청과', '싱싱야채', '우리정육', '바다수산', '정성반찬', '고소한빵집'][index % 6]} ${Math.floor(index / 6) + 1}호`,
      category: ['과일', '채소', '정육', '수산물', '반찬', '떡·베이커리'][
        index % 6
      ],
      address: '테스트 시장 내부',
      image_url: '',
    })).filter((store) => store.store_name.includes(keyword));
    return {
      stores: stores.slice((page - 1) * size, page * size),
      total_count: stores.length,
      page,
      size,
    };
  }
  throw new Error(
    `테스트 모드에서 아직 지원하지 않는 요청이에요: ${method} ${url.pathname}`,
  );
}
