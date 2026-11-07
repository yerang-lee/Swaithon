import { Platform } from 'react-native';

type UploadOptions = { headers?: Record<string, string>; signal?: AbortSignal };
type UploadResponse = Pick<Response, 'ok' | 'status' | 'json'>;

// Native XHR sends RN FormData file URIs directly; Expo fetch's converter rejects them.
export function postMultipart(url: string, body: FormData, options: UploadOptions = {}): Promise<UploadResponse> {
  if (Platform.OS === 'web') return fetch(url, { method: 'POST', body, ...options });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => {
      options.signal?.removeEventListener('abort', abort);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      globalThis.__jangbosoLogError?.('services/api/multipart.ts', error);
      reject(error);
    };
    const abort = () => {
      xhr.abort();
      fail(new Error('파일 전송이 취소됐어요.'));
    };
    if (options.signal?.aborted) {
      fail(new Error('파일 전송이 취소됐어요.'));
      return;
    }
    xhr.onload = () => {
      if (settled) return;
      const status = xhr.status;
      const text = xhr.responseText;
      settled = true;
      cleanup();
      resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text) });
    };
    xhr.onerror = () => fail(new TypeError('파일을 서버로 전송하지 못했어요.'));
    xhr.onabort = () => fail(new Error('파일 전송이 취소됐어요.'));
    xhr.ontimeout = () => fail(new Error('파일 전송 시간이 초과됐어요.'));
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      xhr.open('POST', url);
      for (const [key, value] of Object.entries(options.headers ?? {})) {
        // The native multipart encoder owns Content-Type and its boundary.
        if (key.toLowerCase() !== 'content-type') xhr.setRequestHeader(key, value);
      }
      xhr.send(body);
    } catch (error) {
      fail(error);
    }
  });
}
