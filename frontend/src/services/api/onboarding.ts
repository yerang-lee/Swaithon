import { ApiError, patchJson } from './client';
import { getAuthSession, setAuthRole } from './auth';
export type OnboardingRequest =
  | { role: 'CUSTOMER' }
  | {
      role: 'MERCHANT';
      kakao_place_id: string;
      market_name: string;
      address: string;
      latitude: number;
      longitude: number;
      store_name: string;
      description?: string;
    };
export type OnboardingResponse = {
  user_id: number;
  role: 'CUSTOMER' | 'MERCHANT';
  market_id: number | null;
  store_id: number | null;
  store_name: string | null;
  onboarding_completed: true;
};
export async function registerOnboarding(
  request: OnboardingRequest,
): Promise<OnboardingResponse> {
  const session = getAuthSession();
  if (!session || session.expiresAt <= Date.now())
    throw new Error('로그인이 필요해요. 다시 로그인해주세요.');
  let body: OnboardingRequest;
  if (request.role === 'CUSTOMER') body = { role: 'CUSTOMER' };
  else if (request.role === 'MERCHANT') {
    if (
      ![
        request.kakao_place_id,
        request.market_name,
        request.address,
        request.store_name,
      ].every((v) => typeof v === 'string' && !!v.trim()) ||
      !Number.isFinite(request.latitude) ||
      Math.abs(request.latitude) > 90 ||
      !Number.isFinite(request.longitude) ||
      Math.abs(request.longitude) > 180 ||
      (request.description !== undefined &&
        typeof request.description !== 'string')
    )
      throw new Error(
        '가게 이름과 카카오 검색에서 선택한 시장 정보를 확인해주세요.',
      );
    body = {
      role: 'MERCHANT',
      kakao_place_id: request.kakao_place_id.trim(),
      market_name: request.market_name.trim(),
      address: request.address.trim(),
      latitude: request.latitude,
      longitude: request.longitude,
      store_name: request.store_name.trim(),
      ...(request.description?.trim()
        ? { description: request.description.trim() }
        : {}),
    };
  } else throw new Error('이용 유형을 확인해주세요.');
  let data: unknown;
  try {
    data = await patchJson(
      '/users/me/onboarding',
      body,
      session.access_token,
      200,
    );
  } catch (error) {
    globalThis.__jangbosoLogError?.('services/api/onboarding.ts', error);
    if (error instanceof ApiError) {
      const messages: Record<number, string> = {
        400: '상인 필수 정보와 입력값을 확인해주세요.',
        401: '인증이 만료됐어요. 다시 로그인해주세요.',
        404: '사용자 정보를 찾을 수 없어요.',
        409: '이미 온보딩이 완료된 계정이에요. 로그인해서 등록 정보를 확인해주세요.',
        500: '서버 오류로 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
      };
      throw new ApiError(error.status, messages[error.status] ?? error.message);
    }
    throw error;
  }
  const result = data as OnboardingResponse | null;
  const positive = (v: unknown) =>
    typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
  if (
    !result ||
    !positive(result.user_id) ||
    result.role !== request.role ||
    result.onboarding_completed !== true ||
    (request.role === 'CUSTOMER'
      ? result.market_id !== null ||
        result.store_id !== null ||
        result.store_name !== null
      : !positive(result.market_id) ||
        !positive(result.store_id) ||
        typeof result.store_name !== 'string' ||
        !result.store_name.trim())
  )
    throw new Error(
      '온보딩 완료 응답을 확인할 수 없어요. 등록 상태를 확인해주세요.',
    );
  if (getAuthSession()?.access_token !== session.access_token)
    throw new Error('로그인 계정이 변경됐어요. 다시 로그인해주세요.');
  setAuthRole(result.role, session.access_token, result.store_id);
  return result;
}
