import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { postMultipart } from './multipart';
import { getAuthSession } from './auth';
import { isMockMode } from '../devMock';

export const AUDIO_LIMIT = { milliseconds: 30000, bytes: 10 * 1024 * 1024 };
export const executionPaths = [
  '/voice/product-registration',
  '/voice/product-update',
  '/voice/sale-registration',
  '/voice/product-delete',
  '/voice/sold-out',
  '/voice/sale-delete',
] as const;
export type CommandStatus =
  | 'NEEDS_INPUT'
  | 'NEEDS_SELECTION'
  | 'NEEDS_CONFIRMATION'
  | 'SUCCEEDED'
  | 'CANCELLED';
export type Candidate = {
  listing_id: string | number;
  product_name?: string;
  sale_quantity?: number;
  sale_unit?: string;
  price?: number;
};
export type VoiceCommand = {
  command_id: string;
  status: CommandStatus;
  intent?: string;
  message: string;
  transcript?: string;
  execution_endpoint: string | null;
  candidates: Candidate[];
  preview: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };
  result: Record<string, unknown> | null;
  expiresAt: number;
};
export type RecordedAudio = {
  uri: string;
  durationMillis: number;
  fileSize: number;
};
export class CommandError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const statuses: CommandStatus[] = [
  'NEEDS_INPUT',
  'NEEDS_SELECTION',
  'NEEDS_CONFIRMATION',
  'SUCCEEDED',
  'CANCELLED',
];
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string | number =>
  typeof v === 'string'
    ? !!v.trim()
    : typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const deadlines = new Map<string, number>();
function token() {
  const current = getAuthSession();
  if (!current || current.expiresAt <= Date.now())
    throw new CommandError(401, 'UNAUTHORIZED', '다시 로그인해주세요.');
  if (current.role !== 'MERCHANT')
    throw new CommandError(403, 'FORBIDDEN', '상인 권한이 필요해요.');
  return current.access_token;
}
export function parseCommand(
  data: unknown,
  previousId?: string,
  startedAt = Date.now(),
): VoiceCommand {
  if (
    !object(data) ||
    typeof data.command_id !== 'string' ||
    !data.command_id.trim() ||
    !statuses.includes(data.status as CommandStatus) ||
    (previousId !== undefined && data.command_id !== previousId)
  )
    throw new Error('음성 명령 응답을 확인하지 못했어요.');
  const state = data.status as CommandStatus;
  if (
    state === 'NEEDS_CONFIRMATION' &&
    ![
      'PRODUCT_CREATE',
      'PRODUCT_UPDATE',
      'SALE_CREATE',
      'PRODUCT_DELETE',
      'SOLD_OUT',
      'SALE_DELETE',
    ].includes(String(data.intent))
  )
    throw new Error('최종 작업 유형을 확인할 수 없어요.');
  const endpoint = data.execution_endpoint ?? null;
  if (
    (state === 'NEEDS_CONFIRMATION' &&
      (typeof endpoint !== 'string' ||
        !executionPaths.includes(
          endpoint as (typeof executionPaths)[number],
        ))) ||
    (state !== 'NEEDS_CONFIRMATION' && endpoint !== null)
  )
    throw new Error(
      '서버의 실행 경로를 확인할 수 없어요. 실행하지 않았습니다.',
    );
  const candidates = data.candidates ?? [];
  if (
    !Array.isArray(candidates) ||
    !candidates.every(
      (c) =>
        object(c) &&
        id(c.listing_id) &&
        (c.product_name === undefined || typeof c.product_name === 'string') &&
        (c.sale_unit === undefined || typeof c.sale_unit === 'string') &&
        (c.sale_quantity === undefined ||
          (typeof c.sale_quantity === 'number' &&
            Number.isFinite(c.sale_quantity) &&
            c.sale_quantity > 0)) &&
        (c.price === undefined ||
          (typeof c.price === 'number' &&
            Number.isFinite(c.price) &&
            c.price >= 0)),
    ) ||
    (state === 'NEEDS_SELECTION' && !candidates.length)
  )
    throw new Error('선택할 상품 정보를 확인할 수 없어요.');
  const preview = data.preview ?? {};
  if (
    !object(preview) ||
    !(preview.before == null || object(preview.before)) ||
    !(preview.after == null || object(preview.after)) ||
    !(data.result == null || object(data.result))
  )
    throw new Error('상품 비교 정보를 확인할 수 없어요.');
  if (
    state === 'NEEDS_CONFIRMATION' &&
    !object(preview.before) &&
    !object(preview.after)
  )
    throw new Error('변경 전후 정보를 확인할 수 없어 실행하지 않았어요.');
  const serverExpiry =
    typeof data.expires_at === 'string' ? Date.parse(data.expires_at) : NaN;
  const expiresAt = Math.min(
    deadlines.get(data.command_id) ?? startedAt + 10 * 60 * 1000,
    Number.isFinite(serverExpiry) ? serverExpiry : Infinity,
  );
  deadlines.set(data.command_id, expiresAt);
  return {
    command_id: data.command_id,
    status: state,
    intent: typeof data.intent === 'string' ? data.intent : undefined,
    message:
      typeof data.message === 'string'
        ? data.message
        : '분석 결과를 확인해주세요.',
    transcript:
      typeof data.transcript === 'string' ? data.transcript : undefined,
    execution_endpoint: endpoint as string | null,
    candidates: candidates as Candidate[],
    preview: {
      before: (preview.before as Record<string, unknown>) ?? null,
      after: (preview.after as Record<string, unknown>) ?? null,
    },
    result: (data.result as Record<string, unknown>) ?? null,
    expiresAt,
  };
}
function failure(status: number, detail: unknown): CommandError {
  const code =
    object(detail) && typeof detail.code === 'string' ? detail.code : '';
  const codes: Record<string, string> = {
    WRONG_ENDPOINT: '실행 경로가 변경됐어요. 새로 분석하고 확인해주세요.',
    EXPIRED: '명령이 만료됐어요. 새로 분석해주세요.',
    STALE_COMMAND: '분석 내용이 바뀌었어요. 새로 분석하고 확인해주세요.',
    STALE_PRODUCT: '상품 정보가 변경됐어요. 새로 분석하고 확인해주세요.',
  };
  const messages: Record<number, string> = {
    400: '입력 내용을 확인해주세요.',
    401: '로그인이 만료됐어요. 다시 로그인해주세요.',
    403: '해당 가게나 상품을 관리할 권한이 없어요.',
    404: '명령 또는 상품에 접근할 수 없어요.',
    409: '명령이 만료되었거나 상품이 변경됐어요. 다시 분석해주세요.',
    413: '녹음 파일이 10MB를 초과했어요.',
    422: '입력값이나 선택한 상품, 음성을 확인해주세요.',
    503: '음성 분석 서비스를 사용할 수 없어요. 잠시 후 다시 시도하거나 텍스트를 입력해주세요.',
  };
  return new CommandError(
    status,
    code,
    codes[code] ??
      messages[status] ??
      '음성 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
  );
}
export function checkAudio(audio: RecordedAudio) {
  if (
    !audio.uri ||
    !Number.isFinite(audio.durationMillis) ||
    audio.durationMillis <= 0 ||
    audio.durationMillis > AUDIO_LIMIT.milliseconds
  )
    throw new Error('1~30초 이내로 녹음해주세요.');
  if (
    Platform.OS !== 'web' &&
    (!Number.isFinite(audio.fileSize) ||
      audio.fileSize <= 0 ||
      audio.fileSize > AUDIO_LIMIT.bytes)
  )
    throw new Error('빈 파일이 아닌 10MB 이내 녹음이 필요해요.');
}
async function audioBody(audio: RecordedAudio) {
  checkAudio(audio);
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(audio.uri)).blob();
    if (!blob.size || blob.size > AUDIO_LIMIT.bytes)
      throw new Error('빈 파일이 아닌 10MB 이내 녹음이 필요해요.');
    const types: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp4': 'mp4',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
    };
    const ext = types[blob.type.split(';')[0]];
    if (!ext) throw new Error('지원하지 않는 녹음 형식이에요.');
    form.append('file', blob, `voice.${ext}`);
  } else {
    const ext = audio.uri.split('?')[0].split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      webm: 'audio/webm',
      mp4: 'audio/mp4',
      ogg: 'audio/ogg',
    };
    if (!ext || !types[ext]) throw new Error('지원하지 않는 녹음 형식이에요.');
    const file = new File(audio.uri);
    if (
      !Number.isFinite(file.size) ||
      file.size <= 0 ||
      file.size > AUDIO_LIMIT.bytes
    )
      throw new Error('빈 파일이 아닌 10MB 이내 녹음이 필요해요.');
    // postMultipart uses native XHR for RN's URI-based file parts.
    form.append('file', {
      uri: audio.uri,
      name: `voice.${ext}`,
      type: types[ext],
    } as unknown as Blob);
  }
  return form;
}
async function request(
  path: string,
  body: FormData | Record<string, unknown> | undefined,
  previousId?: string,
): Promise<VoiceCommand> {
  const access = token();
  const start = Date.now();
  if (isMockMode()) return mockRequest(path, body, access, previousId);
  const base = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!base) throw new Error('서버 주소가 설정되지 않았어요.');
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 60000);
  try {
    const multipart = body instanceof FormData;
    const url = `${base.replace(/\/$/, '')}${path}`;
    const response = multipart
      ? await postMultipart(url, body as FormData, {
          headers: { Authorization: `Bearer ${access}` },
          signal: controller.signal,
        })
      : await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access}`,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
    let data: unknown;
    try {
      data = await response.json();
    } catch (__caughtError) {
      globalThis.__jangbosoLogError?.(
        'services/api/voiceCommands.ts',
        __caughtError,
      );
      throw new Error('서버 결과를 확인하지 못했어요.');
    }
    if (!response.ok)
      throw failure(response.status, object(data) ? data.detail : undefined);
    if (getAuthSession()?.access_token !== access)
      throw new Error('로그인 계정이 변경됐어요.');
    return parseCommand(data, previousId, start);
  } catch (e) {
    globalThis.__jangbosoLogError?.('services/api/voiceCommands.ts', e);
    if (controller.signal.aborted || e instanceof TypeError)
      throw new CommandError(0, 'NETWORK', '서버 응답을 확인하지 못했어요.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
function waiting(command: VoiceCommand) {
  if (!['NEEDS_INPUT', 'NEEDS_SELECTION'].includes(command.status))
    throw new Error('현재 명령은 추가 답변을 받을 수 없어요.');
  if (command.expiresAt <= Date.now())
    throw new CommandError(409, 'EXPIRED', '명령이 만료됐어요.');
}
export async function analyzeText(text: string) {
  if (!text.trim()) throw new Error('상품 정보를 입력해주세요.');
  return request('/voice/analyze', { text: text.trim() });
}
export async function analyzeAudio(audio: RecordedAudio) {
  return request('/voice/analyze-audio', await audioBody(audio));
}
export async function answerText(command: VoiceCommand, text: string) {
  waiting(command);
  if (!text.trim()) throw new Error('답변을 입력해주세요.');
  return request(
    `/voice/commands/${encodeURIComponent(command.command_id)}/answer`,
    { text: text.trim() },
    command.command_id,
  );
}
export async function selectCandidate(
  command: VoiceCommand,
  listingId: string | number,
) {
  waiting(command);
  if (
    command.status !== 'NEEDS_SELECTION' ||
    !command.candidates.some((c) => c.listing_id === listingId)
  )
    throw new Error('목록에서 상품을 선택해주세요.');
  return request(
    `/voice/commands/${encodeURIComponent(command.command_id)}/answer`,
    { listing_id: listingId },
    command.command_id,
  );
}
export async function answerAudio(command: VoiceCommand, audio: RecordedAudio) {
  waiting(command);
  return request(
    `/voice/commands/${encodeURIComponent(command.command_id)}/answer-audio`,
    await audioBody(audio),
    command.command_id,
  );
}
export async function cancelCommand(command: VoiceCommand) {
  return request(
    `/voice/commands/${encodeURIComponent(command.command_id)}/cancel`,
    undefined,
    command.command_id,
  );
}
export async function executeCommand(command: VoiceCommand, retry = false) {
  if (
    command.status !== 'NEEDS_CONFIRMATION' ||
    !command.execution_endpoint ||
    !executionPaths.includes(
      command.execution_endpoint as (typeof executionPaths)[number],
    )
  )
    throw new Error('확인이 필요한 명령만 실행할 수 있어요.');
  if (!retry && command.expiresAt <= Date.now())
    throw new CommandError(409, 'EXPIRED', '명령이 만료됐어요.');
  return request(
    command.execution_endpoint,
    { command_id: command.command_id, confirmed: true },
    command.command_id,
  );
}
let sequence = 0;
const drafts = new Map<string, { owner: string; value: VoiceCommand }>();
function clone(value: VoiceCommand): VoiceCommand {
  return JSON.parse(JSON.stringify(value)) as VoiceCommand;
}
function mockRequest(
  path: string,
  body: FormData | Record<string, unknown> | undefined,
  owner: string,
  previousId?: string,
): VoiceCommand {
  if (!previousId) {
    const text =
      body instanceof FormData
        ? '사과 3개 5천 원 등록해 줘'
        : String(body?.text ?? '');
    const status: CommandStatus = text.includes('질문')
      ? 'NEEDS_INPUT'
      : text.includes('후보')
        ? 'NEEDS_SELECTION'
        : text.includes('조회')
          ? 'SUCCEEDED'
          : text.includes('취소')
            ? 'CANCELLED'
            : 'NEEDS_CONFIRMATION';
    const deleting = text.includes('삭제');
    const intent =
      status === 'SUCCEEDED'
        ? 'PRODUCT_DETAIL'
        : deleting
          ? 'PRODUCT_DELETE'
          : text.includes('품절')
            ? 'SOLD_OUT'
            : text.includes('할인')
              ? text.includes('종료')
                ? 'SALE_DELETE'
                : 'SALE_CREATE'
              : text.includes('등록')
                ? 'PRODUCT_CREATE'
                : 'PRODUCT_UPDATE';
    const endpoint: Record<string, string> = {
      PRODUCT_CREATE: '/voice/product-registration',
      PRODUCT_UPDATE: '/voice/product-update',
      PRODUCT_DELETE: '/voice/product-delete',
      SOLD_OUT: '/voice/sold-out',
      SALE_CREATE: '/voice/sale-registration',
      SALE_DELETE: '/voice/sale-delete',
    };
    const value: VoiceCommand = {
      command_id: `mock-command-${++sequence}`,
      status,
      intent,
      message:
        status === 'NEEDS_INPUT'
          ? '가격을 얼마로 할까요?'
          : status === 'NEEDS_SELECTION'
            ? '어떤 사과인지 선택해주세요.'
            : '처리할 내용을 확인해주세요.',
      transcript: text,
      execution_endpoint:
        status === 'NEEDS_CONFIRMATION' ? endpoint[intent] : null,
      candidates:
        status === 'NEEDS_SELECTION'
          ? [
              {
                listing_id: 'sample-a',
                product_name: '사과',
                sale_quantity: 3,
                sale_unit: '개',
                price: 5000,
              },
              {
                listing_id: 'sample-b',
                product_name: '사과',
                sale_quantity: 10,
                sale_unit: '개',
                price: 10000,
              },
            ]
          : [],
      preview: {
        before: {
          product_name: '사과',
          price: 5000,
          sale_quantity: 3,
          sale_unit: '개',
          stock_quantity: 8,
        },
        after: deleting
          ? { status: 'DELETED' }
          : {
              product_name: '사과',
              price: 6000,
              effective_price: intent === 'SALE_CREATE' ? 4800 : 6000,
              sale_active: intent === 'SALE_CREATE',
              sale_quantity: 3,
              sale_unit: '개',
              stock_quantity: 8,
            },
      },
      result:
        status === 'SUCCEEDED'
          ? {
              product_name: '사과',
              price: 5000,
              effective_price: 5000,
              sale_active: false,
              stock_quantity: 8,
            }
          : null,
      expiresAt: Date.now() + 600000,
    };
    drafts.set(value.command_id, { owner, value });
    return clone(value);
  }
  const item = drafts.get(previousId);
  if (!item || item.owner !== owner)
    throw new CommandError(404, 'NOT_FOUND', '명령에 접근할 수 없어요.');
  const value = item.value;
  if (path.endsWith('/cancel')) {
    if (value.status === 'SUCCEEDED')
      throw new CommandError(409, 'STALE_COMMAND', '이미 실행된 명령이에요.');
    value.status = 'CANCELLED';
    value.execution_endpoint = null;
    value.message = '변경하지 않고 취소했어요.';
    return clone(value);
  }
  const executing = executionPaths.includes(
    path as (typeof executionPaths)[number],
  );
  if (executing && value.status === 'SUCCEEDED') return clone(value);
  if (value.expiresAt <= Date.now() || value.status === 'CANCELLED')
    throw new CommandError(409, 'EXPIRED', '명령이 만료되었거나 취소됐어요.');
  if (executing) {
    if (
      path !== value.execution_endpoint ||
      value.status !== 'NEEDS_CONFIRMATION'
    )
      throw new CommandError(409, 'WRONG_ENDPOINT', '새로 분석해주세요.');
    value.status = 'SUCCEEDED';
    value.result = {
      ...value.preview.after,
      product_id: 101,
      listing_id: 1001,
      store_id: 101,
    };
    value.execution_endpoint = null;
    value.message = '상품 변경을 완료했어요.';
    return clone(value);
  }
  waiting(value);
  value.transcript =
    body instanceof FormData ? '6천 원' : String(body?.text ?? '상품 선택');
  value.status = 'NEEDS_CONFIRMATION';
  value.execution_endpoint = '/voice/product-update';
  value.candidates = [];
  value.message = '변경할 내용을 확인해주세요.';
  return clone(value);
}
