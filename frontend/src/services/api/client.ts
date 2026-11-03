export function postJson(path: string, body: unknown, token?: string): Promise<unknown> { return requestJson(path, 'POST', body, token); }
export function getJson(path: string): Promise<unknown> { return requestJson(path, 'GET'); }
async function requestJson(path: string, method: 'POST' | 'GET', body?: unknown, token?: string): Promise<unknown> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!baseUrl) throw new Error('API 서버 주소가 설정되지 않았어요. EXPO_PUBLIC_API_URL을 설정해주세요.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : null;
      throw new ApiError(response.status, typeof detail === 'string' ? detail : `요청에 실패했어요. (${response.status})`);
    }
    return data;
  } catch (error) {
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

