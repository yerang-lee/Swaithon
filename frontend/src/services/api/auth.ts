import { logAppError } from '../../utils/appDiagnostics';
import { ApiError, getJson, postJson } from './client';

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
export type AccountRole = 'CUSTOMER' | 'MERCHANT';
let session:
  | (LoginResponse & {
      expiresAt: number;
      role?: AccountRole;
      storeId?: number;
    })
  | null = null;
export function getAuthSession() {
  return session ? { ...session } : null;
}
export function clearAuthSession() {
  session = null;
}
export function setAuthRole(
  role: AccountRole,
  accessToken: string,
  storeId?: number | null,
) {
  if (session?.access_token !== accessToken) return;
  session.role = role;
  if (role === 'CUSTOMER') delete session.storeId;
  else if (
    typeof storeId === 'number' &&
    Number.isSafeInteger(storeId) &&
    storeId > 0
  )
    session.storeId = storeId;
}

export async function getMyStoreId(): Promise<number> {
  const current = getAuthSession();
  if (!current || current.expiresAt <= Date.now())
    throw new ApiError(401, '다시 로그인해주세요.');
  if (current.role !== 'MERCHANT')
    throw new Error('상인 계정에서 이용할 수 있어요.');
  if (!current.storeId) await loadAccountRole(current.access_token);
  const updated = getAuthSession();
  if (updated?.access_token !== current.access_token)
    throw new Error('로그인 계정이 변경됐어요.');
  if (updated.role !== 'MERCHANT' || !updated.storeId)
    throw new Error(
      '내 가게 정보를 확인할 수 없어요. 서버의 내 정보 응답에 가게 ID가 필요해요.',
    );
  return updated.storeId;
}

// 임시 연동 가정: GET /users/me의 최상위 role. 상세 명세 확인 필요.
async function loadAccountRole(accessToken: string): Promise<void> {
  try {
    const profile = await getJson('/users/me', accessToken);
    if (
      profile &&
      typeof profile === 'object' &&
      'role' in profile &&
      (profile.role === 'CUSTOMER' || profile.role === 'MERCHANT')
    ) {
      setAuthRole(
        profile.role,
        accessToken,
        'store_id' in profile && typeof profile.store_id === 'number'
          ? profile.store_id
          : undefined,
      );
    }
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/auth.ts', error);
    logAppError('auth/loadAccountRole', error);
    // 역할 조회 실패로 로그인 자체를 실패시키지 않으며 상인 UI는 숨깁니다.
  }
}

export async function logout(): Promise<void> {
  const current = getAuthSession();
  if (!current) return;
  try {
    const data = await postJson(
      '/auth/logout',
      { refresh_token: current.refresh_token },
      current.access_token,
    );
    if (
      !data ||
      typeof data !== 'object' ||
      !('message' in data) ||
      typeof data.message !== 'string'
    ) {
      throw new Error('로그아웃 응답을 확인할 수 없어요. 다시 시도해주세요.');
    }
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/auth.ts', error);
    if (error instanceof ApiError) {
      if (error.status === 401) {
        if (session?.access_token === current.access_token) clearAuthSession();
        throw new ApiError(
          401,
          '인증이 만료되었거나 유효하지 않아요. 다시 로그인해주세요.',
        );
      }
      if (error.status === 500)
        throw new Error(
          '서버 오류로 로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.',
        );
    }
    throw error;
  }
  if (session?.access_token === current.access_token) clearAuthSession();
}

async function authRequest(path: string, body: unknown, signup: boolean) {
  try {
    return await postJson(path, body);
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/auth.ts', error);
    if (error instanceof ApiError) {
      const message =
        error.status === 400
          ? '입력값 형식을 확인해주세요.'
          : error.status === 401 && !signup
            ? '전화번호 또는 비밀번호가 일치하지 않아요.'
            : error.status === 409 && signup
              ? '이미 가입된 전화번호예요.'
              : error.status === 500
                ? '서버에 문제가 발생했어요. 잠시 후 다시 시도해주세요.'
                : error.message;
      throw new ApiError(error.status, message);
    }
    throw error;
  }
}

export async function login(
  phone: string,
  password: string,
): Promise<LoginResponse> {
  const data = await authRequest('/auth/login', { phone, password }, false);
  if (
    !data ||
    typeof data !== 'object' ||
    !('access_token' in data) ||
    typeof data.access_token !== 'string' ||
    !data.access_token ||
    !('refresh_token' in data) ||
    typeof data.refresh_token !== 'string' ||
    !data.refresh_token ||
    !('token_type' in data) ||
    data.token_type !== 'bearer' ||
    !('expires_in' in data) ||
    typeof data.expires_in !== 'number' ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  ) {
    throw new Error('로그인 응답 형식이 명세와 달라요.');
  }
  const result = data as LoginResponse;
  session = { ...result, expiresAt: Date.now() + result.expires_in * 1000 };
  await loadAccountRole(result.access_token);
  return result;
}

export async function signup(
  name: string,
  phone: string,
  password: string,
): Promise<SignupResponse> {
  const data = await authRequest(
    '/auth/signup',
    { phone, password, name },
    true,
  );
  if (
    !data ||
    typeof data !== 'object' ||
    !('user_id' in data) ||
    typeof data.user_id !== 'number' ||
    !('phone' in data) ||
    typeof data.phone !== 'string' ||
    !('name' in data) ||
    typeof data.name !== 'string' ||
    !('created_at' in data) ||
    typeof data.created_at !== 'string'
  ) {
    throw new Error('회원가입 응답 형식이 명세와 달라요.');
  }
  return data as SignupResponse;
}
