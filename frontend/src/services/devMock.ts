import { useSyncExternalStore } from 'react';

let enabled = __DEV__ && process.env.EXPO_PUBLIC_MOCK_API === 'true';
const listeners = new Set<() => void>();
export function isMockMode() { return __DEV__ && enabled; }
export function setMockMode(value: boolean) { enabled = __DEV__ && value; listeners.forEach(listener => listener()); }
export function useMockMode() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, isMockMode, isMockMode); }
export const mockLocation = { latitude: 37.539, longitude: 126.96, name: '용문동 (테스트)', radius: 3 };
type Account = { user_id: number; phone: string; name: string; role: 'CUSTOMER' | 'MERCHANT' };
const accounts = new Map<string, Account>([
  ['01000000001', { user_id: 1, phone: '01000000001', name: '테스트 상인', role: 'MERCHANT' }],
  ['01000000002', { user_id: 2, phone: '01000000002', name: '테스트 고객', role: 'CUSTOMER' }],
]);
const sessions = new Map<string, Account>();
let sequence = 100;
export async function mockRequest(path: string, method: string, body?: unknown, token?: string): Promise<unknown> {
  await new Promise(resolve => setTimeout(resolve, 250));
  const url = new URL(path, 'https://mock.invalid');
  const input = (body ?? {}) as Record<string, unknown>;
  const account = token ? sessions.get(token) : undefined;
  if (method === 'POST' && url.pathname === '/auth/signup') {
    const phone = String(input.phone);
    if (accounts.has(phone)) throw new Error('이미 가입된 테스트 전화번호예요.');
    const created: Account = { user_id: ++sequence, phone, name: String(input.name), role: 'CUSTOMER' };
    accounts.set(phone, created);
    return { ...created, created_at: new Date().toISOString() };
  }
  if (method === 'POST' && url.pathname === '/auth/login') {
    const user = accounts.get(String(input.phone));
    if (!user) throw new Error('테스트 계정으로 가입하거나 테스트 입장 버튼을 사용해주세요.');
    const access = `mock-only-${++sequence}`; sessions.set(access, user);
    return { access_token: access, refresh_token: 'mock-only-refresh', token_type: 'bearer', expires_in: 86400 };
  }
  if (method === 'POST' && url.pathname === '/auth/logout') { if (token) sessions.delete(token); return { message: '로그아웃되었습니다.' }; }
  if (url.pathname === '/users/me' && method === 'GET' && account) return { ...account };
  if (url.pathname === '/users/me/onboarding' && method === 'PATCH' && account) {
    if (input.role !== 'MERCHANT' && input.role !== 'CUSTOMER') throw new Error('테스트 이용 유형을 확인해주세요.');
    account.role = input.role;
    return { ...account, market_id: input.market_id, store_name: input.store_name, onboarding_completed: true };
  }
  if (url.pathname === '/markets/nearby' && method === 'GET') {
    const lat = Number(url.searchParams.get('latitude')), lng = Number(url.searchParams.get('longitude'));
    const radius = Number(url.searchParams.get('radius'));
    return { markets: ['용산용문시장', '공덕시장', '만리시장'].map((name, index) => ({ market_id: index + 1, market_name: name, address: '테스트 시장 주소', latitude: lat, longitude: lng, distance: (index + 1) * 250, image_url: '' })).filter(m => m.distance <= radius) };
  }
  const match = url.pathname.match(/^\/markets\/(\d+)\/stores$/);
  if (match && method === 'GET') {
    const keyword = url.searchParams.get('keyword') ?? '';
    const page = Number(url.searchParams.get('page') ?? 1), size = Number(url.searchParams.get('size') ?? 10);
    const stores = Array.from({ length: 24 }, (_, index) => ({ store_id: Number(match[1]) * 100 + index + 1, store_name: `${['행복청과', '싱싱야채', '우리정육', '바다수산', '정성반찬', '고소한빵집'][index % 6]} ${Math.floor(index / 6) + 1}호`, category: ['과일', '채소', '정육', '수산물', '반찬', '떡·베이커리'][index % 6], address: '테스트 시장 내부', image_url: '' })).filter(store => store.store_name.includes(keyword));
    return { stores: stores.slice((page - 1) * size, page * size), total_count: stores.length, page, size };
  }
  throw new Error(`테스트 모드에서 아직 지원하지 않는 요청이에요: ${method} ${url.pathname}`);
}
