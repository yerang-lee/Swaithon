import { ApiError, deleteJson, getJson, patchJson } from './client';
import { clearAuthSession, getAuthSession } from './auth';
export type UserProfile = { user_id: number; name: string; phone: string };
function token() {
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now()) throw new ApiError(401, '다시 로그인해주세요.');
  return session.access_token;
}
function parseProfile(data: unknown): UserProfile {
  const profile = data as UserProfile | null;
  if (!profile || !Number.isSafeInteger(profile.user_id) || profile.user_id <= 0 || typeof profile.name !== 'string' || !profile.name.trim() || typeof profile.phone !== 'string') throw new Error('사용자 정보 응답을 확인할 수 없어요.');
  return { user_id: profile.user_id, name: profile.name, phone: profile.phone };
}
function translate(error: unknown): never {
  if (error instanceof ApiError) {
    const messages: Record<number, string> = { 400: '닉네임과 전화번호 형식을 확인해주세요.', 401: '인증이 만료됐어요. 다시 로그인해주세요.', 404: '사용자 정보를 찾을 수 없어요.', 409: '이미 가입된 전화번호이거나 처리 중인 예약으로 요청할 수 없어요.', 500: '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.' };
    throw new ApiError(error.status, messages[error.status] ?? error.message);
  }
  throw error;
}
export async function getMyProfile(): Promise<UserProfile> {
  try { return parseProfile(await getJson('/users/me', token())); } catch (e) { globalThis.__jangbosoLogError?.("services/api/profile.ts", e);  return translate(e); }
}
export async function updateMyProfile(changes: { name?: string; phone?: string }): Promise<UserProfile> {
  if (changes.name !== undefined && (!changes.name.trim() || changes.name.trim().length > 50)) throw new Error('닉네임은 1~50자로 입력해주세요.');
  if (changes.phone !== undefined && !/^01\d{8,9}$/.test(changes.phone)) throw new Error('올바른 휴대전화번호를 입력해주세요.');
  if (changes.name === undefined && changes.phone === undefined) throw new Error('수정할 정보가 없어요.');
  try { return parseProfile(await patchJson('/users/me', { ...(changes.name !== undefined ? { name: changes.name.trim() } : {}), ...(changes.phone !== undefined ? { phone: changes.phone } : {}) }, token())); }
  catch (e) { globalThis.__jangbosoLogError?.("services/api/profile.ts", e);
    if (e instanceof ApiError && e.status === 409) throw new ApiError(409, '이미 가입된 전화번호예요.');
    return translate(e);
  }
}
export async function deleteMyAccount(): Promise<void> {
  const accessToken = token();
  try {
    const data = await deleteJson('/users/me', accessToken);
    if (!data || typeof data !== 'object' || !('message' in data) || data.message !== '회원 탈퇴가 완료되었습니다.') throw new Error('탈퇴 결과를 확인하지 못했어요. 계정 상태를 확인해주세요.');
    if (getAuthSession()?.access_token === accessToken) clearAuthSession();
  } catch (e) { globalThis.__jangbosoLogError?.("services/api/profile.ts", e);
    if (e instanceof ApiError && e.status === 409) throw new ApiError(409, '처리 중인 예약 등으로 탈퇴할 수 없어요. 예약 상태를 확인해주세요.');
    translate(e);
  }
}
