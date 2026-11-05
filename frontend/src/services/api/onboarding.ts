import { ApiError, patchJson } from './client';
import { getAuthSession, setAuthRole } from './auth';
export type OnboardingRequest = { role: 'CUSTOMER' | 'MERCHANT'; market_id?: number; store_name?: string };
export type OnboardingResponse = { user_id: number; role: 'CUSTOMER' | 'MERCHANT'; market_id?: number | null; store_name?: string | null; onboarding_completed: true };
export async function registerOnboarding(request: OnboardingRequest): Promise<OnboardingResponse> {
  if (!['CUSTOMER', 'MERCHANT'].includes(request.role) || (request.market_id !== undefined && (!Number.isSafeInteger(request.market_id) || request.market_id <= 0))) throw new Error('이용 유형과 시장을 확인해주세요.');
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now()) throw new Error('로그인이 필요해요. 다시 로그인해주세요.');
  const body: OnboardingRequest = { role: request.role, ...(request.market_id !== undefined ? { market_id: request.market_id } : {}), ...(request.store_name?.trim() ? { store_name: request.store_name.trim() } : {}) };
  let data: unknown;
  try { data = await patchJson('/users/me/onboarding', body, session.access_token); }
  catch (error) {
    if (error instanceof ApiError) {
      const messages: Record<number, string> = { 400: '온보딩 입력 정보를 확인해주세요.', 401: '인증이 만료됐어요. 완료를 눌러 다시 시도해주세요.', 404: '선택한 시장을 찾을 수 없어요. 시장을 다시 선택해주세요.', 409: '온보딩 정보가 충돌했어요. 등록 상태를 확인해주세요.', 500: '서버 오류로 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.' };
      throw new ApiError(error.status, messages[error.status] || error.message);
    }
    throw error;
  }
  const result = data as OnboardingResponse | null;
  if (!result || !Number.isSafeInteger(result.user_id) || result.role !== request.role || result.onboarding_completed !== true
    || !(result.market_id === undefined || result.market_id === null || Number.isSafeInteger(result.market_id))
    || !(result.store_name === undefined || result.store_name === null || typeof result.store_name === 'string')) throw new Error('온보딩 완료 응답을 확인할 수 없어요. 등록 상태를 확인해주세요.');
  setAuthRole(result.role, session.access_token);
  return result;
}
