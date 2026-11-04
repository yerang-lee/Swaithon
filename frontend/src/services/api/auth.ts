import { ApiError, postJson } from './client';

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
};
export type SignupResponse = {
  user_id: number;
  phone: string;
  name: string;
  created_at: string;
};

// 현재 세션에서만 유지합니다. 영구 저장은 추후 보안 저장소와 연결합니다.
let session: (LoginResponse & { expiresAt: number }) | null = null;
export function getAuthSession() { return session ? { ...session } : null; }
export function clearAuthSession() { session = null; }

export async function logout(): Promise<void> {
  const current = getAuthSession();
  if (!current) return;
  try {
    const data = await postJson('/auth/logout', { refresh_token: current.refresh_token }, current.access_token);
    if (!data || typeof data !== 'object' || !('message' in data) || typeof data.message !== 'string') {
      throw new Error('로그아웃 응답을 확인할 수 없어요. 다시 시도해주세요.');
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        if (session?.access_token === current.access_token) clearAuthSession();
        throw new ApiError(401, '인증이 만료되었거나 유효하지 않아요. 다시 로그인해주세요.');
      }
      if (error.status === 500) throw new Error('서버 오류로 로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    throw error;
  }
  if (session?.access_token === current.access_token) clearAuthSession();
}

async function authRequest(path: string, body: unknown, signup: boolean) {
  try { return await postJson(path, body); }
  catch (error) {
    if (error instanceof ApiError) {
      const message = error.status === 400 ? '입력값 형식을 확인해주세요.'
        : error.status === 401 && !signup ? '전화번호 또는 비밀번호가 일치하지 않아요.'
        : error.status === 409 && signup ? '이미 가입된 전화번호예요.'
        : error.status === 500 ? '서버에 문제가 발생했어요. 잠시 후 다시 시도해주세요.' : error.message;
      throw new ApiError(error.status, message);
    }
    throw error;
  }
}

export async function login(phone: string, password: string): Promise<LoginResponse> {
  const data = await authRequest('/auth/login', { phone, password }, false);
  if (!data || typeof data !== 'object' || !('access_token' in data) || typeof data.access_token !== 'string' || !data.access_token
    || !('refresh_token' in data) || typeof data.refresh_token !== 'string' || !data.refresh_token
    || !('token_type' in data) || data.token_type !== 'bearer'
    || !('expires_in' in data) || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new Error('로그인 응답 형식이 명세와 달라요.');
  }
  const result = data as LoginResponse;
  session = { ...result, expiresAt: Date.now() + result.expires_in * 1000 };
  return result;
}

export async function signup(name: string, phone: string, password: string): Promise<SignupResponse> {
  const data = await authRequest('/auth/signup', { phone, password, name }, true);
  if (!data || typeof data !== 'object' || !('user_id' in data) || typeof data.user_id !== 'number'
    || !('phone' in data) || typeof data.phone !== 'string'
    || !('name' in data) || typeof data.name !== 'string'
    || !('created_at' in data) || typeof data.created_at !== 'string') {
    throw new Error('회원가입 응답 형식이 명세와 달라요.');
  }
  return data as SignupResponse;
}
