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
const mockOnboarded = new Set<number>();
const onboardingMarketIds = new Map<string,number>([['mock-kakao-1',1],['mock-kakao-2',4],['mock-kakao-3',2]]);
let nextOnboardingMarketId = 5;
const mockFavorites = new Map<string, Map<string, Record<string, unknown>>>();
const mockCancellations = new Map<number, Set<number>>();
// 테스트 입장 버튼은 이전 정보 수정/탈퇴에 영향을 받지 않는 새 예시 계정을 준비합니다.
export function prepareMockAccount(role: Account['role']): string {
  if (!isMockMode()) throw new Error('개발용 테스트 모드에서만 사용할 수 있어요.');
  const userId = role === 'MERCHANT' ? 1 : 2;
  const phone = role === 'MERCHANT' ? '01000000001' : '01000000002';
  for (const [key, account] of accounts) if (account.user_id === userId) accounts.delete(key);
  for (const [key, account] of sessions) if (account.user_id === userId || account.phone === phone) sessions.delete(key);
  mockCancellations.delete(userId); mockOnboarded.delete(userId);
  accounts.set(phone, { user_id: userId, phone, name: role === 'MERCHANT' ? '테스트 상인' : '테스트 고객', role });
  return phone;
}
export async function mockRequest(path: string, method: string, body?: unknown, token?: string): Promise<unknown> {
  await new Promise(resolve => setTimeout(resolve, 250));
  const url = new URL(path, 'https://mock.invalid');
  const input = (body ?? {}) as Record<string, unknown>;
  const account = token ? sessions.get(token) : undefined;

  const favoriteCancelMatch = url.pathname.match(/^\/favorites\/([^/]+)$/);
  if (favoriteCancelMatch && method === 'DELETE') {
    if (!account) throw new Error('로그인 후 관심상품을 취소해주세요.');
    const favoriteId = decodeURIComponent(favoriteCancelMatch[1]);
    for (const saved of mockFavorites.values()) {
      for (const [listingId, item] of saved) {
        if (item.favorite_id !== favoriteId) continue;
        if (item.user_id !== String(account.user_id)) throw new Error('다른 사용자의 관심상품은 취소할 수 없어요.');
        saved.delete(listingId);
        return {favorite_id:favoriteId,listing_id:listingId,message:'찜이 취소되었습니다.'};
      }
    }
    throw new Error('취소할 관심상품을 찾을 수 없어요.');
  }
  if (url.pathname === '/favorites' && method === 'POST') {
    if (!account || !token) throw new Error('로그인 후 관심상품에 추가해주세요.');
    if (typeof input.listing_id !== 'string' || !input.listing_id.trim() || input.request_id !== undefined && typeof input.request_id !== 'string') throw new Error('판매 게시물 정보를 확인해주세요.');
    const saved = mockFavorites.get(token) ?? new Map<string, Record<string, unknown>>();
    if (saved.has(input.listing_id)) throw new Error('이미 관심상품에 추가된 상품이에요.');
    const item = {favorite_id:`favorite_${++sequence}`,user_id:String(account.user_id),listing_id:input.listing_id,product_id:'product_sample',store_id:'store_sample',product_name:'테스트 상품',store_name:'테스트 가게',created_at:new Date().toISOString(),message:'상품이 찜 목록에 추가되었습니다.'};
    saved.set(input.listing_id, item); mockFavorites.set(token, saved);
    return item;
  }
  if (url.pathname === '/users/me/reservations' && method === 'GET' && account) {
    const cancelled = mockCancellations.get(account.user_id) ?? new Set<number>();
    const states = ['READY','COMPLETED','PENDING','CANCELLED','CONFIRMED'] as const;
    const all = Array.from({length:14},(_,i)=>({reservation_id:501+i,product_id:101+i,product_name:['햇사과','당근','배'][i%3],store_id:10,store_name:'행복청과',market_id:1,market_name:'용산용문시장',quantity:i%2+1,unit_price:5000,total_price:5000*(i%2+1),pickup_at:`2026-11-${String(13-Math.floor(i/3)).padStart(2,'0')}T14:00:00`,status:cancelled.has(501+i)?'CANCELLED':states[i%5],created_at:'2026-11-06T10:00:00'})).filter(r=>!url.searchParams.get('status')||r.status===url.searchParams.get('status'));
    const page=Number(url.searchParams.get('page')??1),size=Number(url.searchParams.get('size')??10);
    return {reservations:all.slice((page-1)*size,page*size),total_count:all.length,page,size};
  }
  const cancelMatch = url.pathname.match(/^\/reservations\/(\d+)\/cancel$/);
  if (cancelMatch && method === 'PATCH' && account) {
    const id=Number(cancelMatch[1]),index=id-501;
    if (index<0||index>=14) throw new Error('예약을 찾을 수 없어요.');
    const cancelled=mockCancellations.get(account.user_id)??new Set<number>();
    if (index%5===1||index%5===3||cancelled.has(id)) throw new Error('현재 상태에서는 취소할 수 없어요.');
    cancelled.add(id);mockCancellations.set(account.user_id,cancelled);
    return {reservation_id:id,status:'CANCELLED',cancelled_at:new Date().toISOString(),message:'예약이 취소되었습니다.'};
  }
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
  if (url.pathname === '/users/me' && method === 'PATCH' && account) {
    const phone = input.phone === undefined ? account.phone : String(input.phone);
    if (accounts.has(phone) && accounts.get(phone) !== account) throw new Error('이미 가입된 전화번호예요.');
    accounts.delete(account.phone); account.phone = phone;
    if (input.name !== undefined) account.name = String(input.name);
    accounts.set(phone, account);
    return { user_id: account.user_id, name: account.name, phone: account.phone };
  }
  if (url.pathname === '/users/me' && method === 'DELETE' && account) {
    accounts.delete(account.phone);
    for (const [key, value] of sessions) if (value.user_id === account.user_id) sessions.delete(key);
    return { message: '회원 탈퇴가 완료되었습니다.' };
  }

  if (url.pathname === '/users/me/onboarding' && method === 'PATCH' && account) {
    if(mockOnboarded.has(account.user_id))throw Object.assign(new Error('이미 온보딩이 완료된 계정이에요.'),{status:409});
    if(input.role!=='MERCHANT'&&input.role!=='CUSTOMER')throw Object.assign(new Error('이용 유형을 확인해주세요.'),{status:400});
    if(input.role==='MERCHANT'&&(!['kakao_place_id','market_name','address','store_name'].every(key=>typeof input[key]==='string'&&String(input[key]).trim())||typeof input.latitude!=='number'||!Number.isFinite(input.latitude)||Math.abs(input.latitude)>90||typeof input.longitude!=='number'||!Number.isFinite(input.longitude)||Math.abs(input.longitude)>180))throw Object.assign(new Error('상인 필수 정보를 확인해주세요.'),{status:400});
    account.role=input.role;mockOnboarded.add(account.user_id);
    if(input.role==='CUSTOMER')return {user_id:account.user_id,role:'CUSTOMER',market_id:null,store_id:null,store_name:null,onboarding_completed:true};
    const place=String(input.kakao_place_id);
    if(!onboardingMarketIds.has(place))onboardingMarketIds.set(place,nextOnboardingMarketId++);
    return {user_id:account.user_id,role:'MERCHANT',market_id:onboardingMarketIds.get(place),store_id:++sequence,store_name:String(input.store_name).trim(),onboarding_completed:true};
  }
  // Numeric category IDs below are test fixtures, not production mappings.
  if (url.pathname === '/products' && method === 'GET' || /^\/products\/\d+$/.test(url.pathname) && method === 'GET') {
    const categoryNames=['채소','과일','정육·계란','수산물','반찬','가공식품','곡물·견과','떡·베이커리','기타'];
    const categoryCodes=['VEGETABLE','FRUIT','MEAT_EGGS','SEAFOOD','SIDE_DISH','PROCESSED_FOOD','GRAINS_NUTS','RICE_CAKE_BAKERY','OTHER'];
    const all=Array.from({length:36},(_,i)=>({listing_id:1001+i,product_id:1+i,store_id:101+i%6,store_name:['행복청과','싱싱야채','우리정육'][i%3],market_id:i<27?1:2,product_name:['당근','사과','계란','고등어','김치','두부','쌀','빵','기타 상품'][i%9],category_id:i%9+1,category:categoryCodes[i%9],category_name:categoryNames[i%9],price:5000+i*100,sale_price:i%3===0?4000+i*100:null,is_sold_out:i%7===0,is_on_sale:i%3===0,image_url:null,created_at:new Date(Date.UTC(2026,10,6,12,0)-i*60000).toISOString()}));
    if(url.pathname!=='/products'){
      const product=all.find(p=>String(p.listing_id)===url.pathname.split('/').pop());
      if(!product)throw new Error('상품을 찾을 수 없어요.');
      return {...product,image_url:'',description:'화면 확인용 예시 상품입니다.'};
    }
    const filtered=all.filter(p=>(!url.searchParams.has('market_id')||p.market_id===Number(url.searchParams.get('market_id')))&&(!url.searchParams.has('category_id')||p.category_id===Number(url.searchParams.get('category_id')))&&(!url.searchParams.has('is_sold_out')||p.is_sold_out===(url.searchParams.get('is_sold_out')==='true'))&&(!url.searchParams.has('is_on_sale')||p.is_on_sale===(url.searchParams.get('is_on_sale')==='true'))&&p.product_name.includes(url.searchParams.get('keyword')??''));
    const page=Number(url.searchParams.get('page')??1),size=Number(url.searchParams.get('size')??10);
    return {products:filtered.slice((page-1)*size,page*size),total_count:filtered.length,page,size};
  }
  if (url.pathname === '/markets/search/kakao' && method === 'GET') {
    const query=(url.searchParams.get('query')??'').trim();
    if(!query)throw new Error('검색어를 입력해주세요.');
    const documents=[{market_name:'용산용문시장',address:'서울 용산구 효창원로42길',latitude:37.539,longitude:126.96},{market_name:'망원시장',address:'서울 마포구 포은로8길 14',latitude:37.5563,longitude:126.9102},{market_name:'공덕시장',address:'서울 마포구 공덕동',latitude:37.544,longitude:126.953},{market_name:'미등록시장',address:'서울 테스트 주소',latitude:37.55,longitude:126.95}].map((m,i)=>({...m,place_id:`mock-kakao-${i+1}`,market_id:[1,4,2,null][i],category_name:'가정,생활 > 시장',place_url:''})).filter(m=>m.market_name.includes(query)||m.address.includes(query));
    return {documents,total_count:documents.length,is_end:true};
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
