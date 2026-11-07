export function postJson(path: string, body: unknown, token?: string, expectedStatus?: number): Promise<unknown> { return requestJson(path, 'POST', body, token, expectedStatus); }
export function getJson(path: string, token?: string): Promise<unknown> { return requestJson(path, 'GET', undefined, token); }
export function patchJson(path: string, body: unknown, token: string, expectedStatus?: number): Promise<unknown> { return requestJson(path, 'PATCH', body, token, expectedStatus); }
export function deleteJson(path: string, token: string): Promise<unknown> { return requestJson(path, 'DELETE', undefined, token); }
async function requestJson(path: string, method: 'POST' | 'GET' | 'PATCH' | 'DELETE', body?: unknown, token?: string, expectedStatus?: number): Promise<unknown> {
  if (isMockMode()) return mockRequest(path, method, body, token);
  if (token?.startsWith('mock-only-')) throw new Error('테스트 세션이 종료됐어요. 다시 로그인해주세요.');
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!baseUrl) {
    logApiError(method, path, 'EXPO_PUBLIC_API_URL이 설정되지 않았습니다.');
    throw new Error('API 서버 주소가 설정되지 않았어요. EXPO_PUBLIC_API_URL을 설정해주세요.');
  }
  const privateValues = [...Object.values(body && typeof body === 'object' ? body : {}).filter((v): v is string => typeof v === 'string'), ...(token ? [token] : [])];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : null; } catch (__caughtError) { globalThis.__jangbosoLogError?.("services/api/client.ts", __caughtError);  data = null; }
    if (!response.ok) {
      const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : null;
      const reason = response.status === 404 ? '요청 경로 또는 대상 데이터를 서버에서 찾지 못했습니다.' : response.status === 405 ? '서버가 이 HTTP 메서드를 허용하지 않습니다.' : `서버가 HTTP ${response.status} 오류를 반환했습니다.`;
      logApiError(method, path, reason, response.status, detail, privateValues);
      const labels: Record<string, string> = { phone: '전화번호', password: '비밀번호', name: '닉네임', role: '이용 유형', market_id: '시장', store_name: '가게 이름' };
      const validation = Array.isArray(detail) ? detail.map(item => {
        if (!item || typeof item !== 'object' || !Array.isArray(item.loc) || typeof item.msg !== 'string') return '';
        const field = String(item.loc[item.loc.length - 1]);
        return `${labels[field] || field}: ${item.msg}`;
      }).filter(Boolean).join('\n') : '';
      throw new ApiError(response.status, typeof detail === 'string' ? detail : validation || `요청에 실패했어요. (${response.status})`);
    }
    if (expectedStatus !== undefined && response.status !== expectedStatus) throw new Error('서버 응답 상태가 명세와 달라요. 처리 내역을 확인해주세요.');
    return data;
  } catch (error) { globalThis.__jangbosoLogError?.("services/api/client.ts", error);
    if (!(error instanceof ApiError)) logApiError(method, path, controller.signal.aborted ? '15초 안에 서버 응답이 없어 시간 초과되었습니다.' : error instanceof Error ? error.message : '알 수 없는 요청 오류', undefined, undefined, privateValues);
    if (controller.signal.aborted) throw new Error('서버 응답이 늦어요. 잠시 후 다시 시도해주세요.');
    if (error instanceof TypeError) throw new Error('서버에 연결할 수 없어요. 네트워크와 서버 주소를 확인해주세요.');
    throw error;
  } finally { clearTimeout(timeout); }
}
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

import { logApiError } from '../../utils/apiDiagnostics';
import { isMockMode, mockRequest } from '../devMock';
