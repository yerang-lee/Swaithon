import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { postMultipart } from './multipart';
import { getAuthSession } from './auth';
import { isMockMode } from '../devMock';

export const AUDIO_LIMIT = { milliseconds: 30000, bytes: 10 * 1024 * 1024 };
export const registrationConfirmEndpoint =
  '/voice/product-registration/confirm';
export const executionPaths = [
  registrationConfirmEndpoint,
  '/voice/product-update',
  '/voice/sale-registration',
  '/voice/product-delete',
  '/voice/sold-out',
  '/voice/sale-delete',
] as const;
export type CommandStatus =
  | 'READY'
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
  analysis_result?: Record<string, unknown>;
  missing_fields?: string[];
  needs_confirmation?: boolean;
  question?: string;
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
  'READY',
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
  input: unknown,
  previousId?: string,
  startedAt = Date.now(),
): VoiceCommand {
  if (!object(input)) throw new Error('음성 명령 응답을 확인하지 못했어요.');
  let data = input;
  if (
    !object(data) ||
    typeof data.command_id !== 'string' ||
    !data.command_id.trim() ||
    !statuses.includes(data.status as CommandStatus) ||
    (previousId !== undefined && data.command_id !== previousId)
  )
    throw new Error('음성 명령 응답을 확인하지 못했어요.');
  if (data.analysis_id !== undefined)
    throw new Error('서버 응답을 command_id 기반으로 확인해주세요.');
  const commandId = data.command_id;
  const state = data.status as CommandStatus;
  if (object(data.parsed) && data.analysis_result === undefined) {
    const confirmable = state === 'READY' || state === 'NEEDS_CONFIRMATION';
    data = {
      ...data,
      intent: data.intent ?? data.parsed.intent,
      analysis_result: data.parsed,
      missing_fields: data.missing_fields ?? [],
      needs_confirmation:
        data.needs_confirmation === undefined
          ? confirmable
          : data.needs_confirmation,
      ...(state === 'NEEDS_INPUT'
        ? { question: data.question ?? data.message }
        : {}),
      transcript:
        data.transcript ??
        (Array.isArray(data.messages) &&
        data.messages.every((value) => typeof value === 'string')
          ? data.messages.join(' ')
          : undefined),
    };
  }
  const modern = state === 'READY' || data.analysis_result !== undefined;
  const confirmable = state === 'READY' || state === 'NEEDS_CONFIRMATION';
  if (
    modern &&
    (!object(data.analysis_result) ||
      !Array.isArray(data.missing_fields) ||
      !data.missing_fields.every((value) => typeof value === 'string') ||
      typeof data.needs_confirmation !== 'boolean' ||
      (state === 'READY' &&
        (!data.needs_confirmation || data.missing_fields.length !== 0)) ||
      (state === 'NEEDS_INPUT' &&
        (data.needs_confirmation ||
          typeof data.question !== 'string' ||
          !data.question.trim())) ||
      (data.question != null && typeof data.question !== 'string') ||
      (data.transcript !== undefined && typeof data.transcript !== 'string'))
  )
    throw new Error('음성 분석 결과와 추가 질문을 확인할 수 없어요.');
  if (modern && object(data.analysis_result)) {
    const result = data.analysis_result;
    if (
      ['product_name', 'unit', 'category', 'category_name'].some(
        (key) =>
          result[key] !== undefined &&
          result[key] !== null &&
          typeof result[key] !== 'string',
      ) ||
      (result.price !== undefined &&
        result.price !== null &&
        (typeof result.price !== 'number' ||
          !Number.isFinite(result.price) ||
          result.price < 0))
    )
      throw new Error('상품 분석 정보의 형식을 확인할 수 없어요.');
  }
  if (
    confirmable &&
    ![
      'PRODUCT_CREATE',
      'PRODUCT_UPDATE',
      'SALE_CREATE',
      'SALE_UPDATE',
      'PRODUCT_DELETE',
      'SOLD_OUT',
      'SALE_DELETE',
    ].includes(String(data.intent))
  )
    throw new Error('최종 작업 유형을 확인할 수 없어요.');
  let endpoint = data.execution_endpoint ?? null;
  if (confirmable && data.intent === 'PRODUCT_CREATE') {
    if (
      endpoint !== null &&
      endpoint !== '/voice/product-registration' &&
      endpoint !== registrationConfirmEndpoint
    )
      throw new Error('상품 등록 확정 주소를 확인할 수 없어요.');
    endpoint = registrationConfirmEndpoint;
  }
  if (
    (state === 'NEEDS_CONFIRMATION' && endpoint === null) ||
    (endpoint !== null &&
      (!confirmable ||
        typeof endpoint !== 'string' ||
        !executionPaths.includes(endpoint as (typeof executionPaths)[number])))
  )
    throw new Error(
      '서버의 실행 경로를 확인할 수 없어요. 실행하지 않았습니다.',
    );
  const candidates = data.candidates ?? [];
  if (state === 'NEEDS_SELECTION' && Array.isArray(candidates) && !candidates.length)
    throw new Error('서버가 선택할 상품 후보를 보내지 않았어요. 후보 목록을 확인해주세요.');
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
  const preview =
    data.preview ?? (modern ? { after: data.analysis_result } : {});
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
  if (modern && !Number.isFinite(serverExpiry) && !deadlines.has(commandId))
    throw new Error('명령의 유효 시간을 확인할 수 없어요. 다시 분석해주세요.');
  const expiresAt = Math.min(
    deadlines.get(commandId) ?? Infinity,
    Number.isFinite(serverExpiry)
      ? serverExpiry
      : (deadlines.get(commandId) ?? startedAt + 10 * 60 * 1000),
  );
  deadlines.set(commandId, expiresAt);
  return {
    command_id: commandId,
    status: state,
    intent: typeof data.intent === 'string' ? data.intent : undefined,
    message:
      typeof data.message === 'string'
        ? data.message
        : '분석 결과를 확인해주세요.',
    transcript:
      typeof data.transcript === 'string' ? data.transcript : undefined,
    analysis_result: object(data.analysis_result)
      ? data.analysis_result
      : undefined,
    missing_fields: Array.isArray(data.missing_fields)
      ? (data.missing_fields as string[])
      : undefined,
    needs_confirmation:
      typeof data.needs_confirmation === 'boolean'
        ? data.needs_confirmation
        : undefined,
    question: typeof data.question === 'string' ? data.question : undefined,
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
  const knownCodes = [
    'WRONG_ENDPOINT',
    'EXPIRED',
    'STALE_COMMAND',
    'STALE_PRODUCT',
    'INVALID_TIME',
    'EMPTY_ANSWER',
    'INVALID_SELECTION',
  ];
  let code =
    object(detail) &&
    typeof detail.code === 'string' &&
    knownCodes.includes(detail.code)
      ? detail.code
      : '';
  let validationMessage: string | undefined;
  if (status === 422) {
    const sttErrors: Record<string, { code: string; message: string }> = {
      '지원하지 않는 녹음 형식입니다.': {
        code: 'STT_UNSUPPORTED_FORMAT',
        message: '서버가 이 녹음 형식을 지원하지 않아요.',
      },
      '녹음은 10MB 이하로 보내주세요.': {
        code: 'STT_AUDIO_SIZE',
        message:
          '서버가 녹음 파일 크기를 처리하지 못했어요. 다시 녹음해주세요.',
      },
      '30초 이내로 녹음해 주세요.': {
        code: 'STT_AUDIO_TOO_LONG',
        message:
          '서버 기준으로 녹음이 30초를 넘었어요. 짧게 다시 녹음해주세요.',
      },
      '음성을 확인하지 못했습니다. 다시 녹음해 주세요.': {
        code: 'STT_NO_SPEECH',
        message:
          '서버가 음성을 인식하지 못했어요. 마이크 가까이에서 다시 말해주세요.',
      },
    };
    const recognized =
      typeof detail === 'string' &&
      Object.prototype.hasOwnProperty.call(sttErrors, detail)
        ? sttErrors[detail]
        : undefined;
    if (recognized) {
      code = recognized.code;
      validationMessage = recognized.message;
    } else if (Array.isArray(detail)) {
      const fields: Record<string, string> = {
        file: '녹음 파일(file)',
        audio_file: '녹음 파일(audio_file)',
        text: '명령 텍스트',
        answer: '추가 답변',
        command_id: '명령 ID',
        confirmed: '확인 여부',
        listing_id: '판매 게시물 ID',
      };
      const types: Record<string, string> = {
        missing: '누락',
        string_type: '문자열 형식 오류',
        int_parsing: '정수 형식 오류',
        bool_parsing: '확인 값 형식 오류',
        extra_forbidden: '허용되지 않는 항목',
      };
      const problems = detail.slice(0, 5).map((item) => {
        const rawField =
          object(item) && Array.isArray(item.loc)
            ? item.loc[item.loc.length - 1]
            : undefined;
        const field =
          typeof rawField === 'string' &&
          Object.prototype.hasOwnProperty.call(fields, rawField)
            ? rawField
            : 'request';
        const type =
          object(item) &&
          typeof item.type === 'string' &&
          Object.prototype.hasOwnProperty.call(types, item.type)
            ? item.type
            : 'invalid';
        return { field, type };
      });
      code = problems.length
        ? `VALIDATION:${problems.map((p) => `${p.field}/${p.type}`).join(',')}`
        : 'UNCLASSIFIED_422';
      if (problems.length)
        validationMessage = `서버 요청 항목 확인이 필요해요: ${problems.map((p) => `${fields[p.field] ?? '요청 항목'} ${types[p.type] ?? '형식 오류'}`).join(', ')}`;
    } else if (!code) code = 'UNCLASSIFIED_422';
  }
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
    409: '이미 완료·취소되었거나 상품이 변경된 명령이에요. 다시 분석해주세요.',
    410: '명령이 만료됐어요. 새로 분석해주세요.',
    500: '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
    413: '녹음 파일이 10MB를 초과했어요.',
    422: '입력값이나 선택한 상품, 음성을 확인해주세요.',
    503: '음성 분석 서비스를 사용할 수 없어요. 잠시 후 다시 시도하거나 텍스트를 입력해주세요.',
  };
  return new CommandError(
    status,
    code,
    validationMessage ??
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
async function audioBody(
  audio: RecordedAudio,
  field: 'file' | 'audio_file' = 'file',
) {
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
    form.append(field, blob, `voice.${ext}`);
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
    form.append(field, {
      uri: audio.uri,
      name: `voice.${ext}`,
      type: types[ext],
    } as unknown as Blob);
  }
  return form;
}
// The current backend registration_response returns the stored command_id as analysis_id.
// Adapt this verified wire format only at the initial registration boundary.
function registrationCommandResponse(input: unknown): unknown {
  if (!object(input) || input.analysis_id === undefined) return input;
  if (
    typeof input.analysis_id !== 'string' ||
    !input.analysis_id.trim() ||
    input.intent !== 'PRODUCT_CREATE' ||
    !['READY', 'NEEDS_INPUT', 'NEEDS_SELECTION', 'NEEDS_CONFIRMATION'].includes(
      String(input.status),
    ) ||
    (input.command_id !== undefined && input.command_id !== input.analysis_id)
  )
    throw new Error('상품 등록 분석의 식별자와 상태를 확인할 수 없어요.');
  const { analysis_id, ...response } = input;
  const result = {
    product_name: input.product_name,
    price: input.price,
    unit: input.unit,
    category: input.category,
    category_name: input.category_name,
  };
  return {
    ...response,
    command_id: analysis_id,
    analysis_result: result,
    preview: input.preview ?? { before: null, after: result },
    ...(input.status === 'NEEDS_INPUT'
      ? { question: input.question ?? input.message }
      : {}),
  };
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
    if (response.status !== 200)
      throw new Error('음성 명령 응답 상태가 명세와 달라요.');
    const analysisOnly =
      path === '/voice/analyze' ||
      (path === '/voice/product-registration' && multipart) ||
      /\/commands\/[^/]+\/answer(?:-audio)?$/.test(path);
    if (
      analysisOnly &&
      object(data) &&
      ['SUCCEEDED', 'CANCELLED'].includes(String(data.status))
    )
      throw new Error('분석 응답을 상품 반영 완료로 처리할 수 없어요.');
    if (getAuthSession()?.access_token !== access)
      throw new Error('로그인 계정이 변경됐어요.');
    return parseCommand(
      path === '/voice/product-registration' && multipart
        ? registrationCommandResponse(data)
        : data,
      previousId,
      start,
    );
  } catch (e) {
    globalThis.__jangbosoLogError?.(
      `services/api/voiceCommands.ts POST ${path.replace(/\/commands\/[^/]+/, '/commands/{command_id}')}`,
      e,
    );
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
    throw new CommandError(410, 'EXPIRED', '명령이 만료됐어요.');
}
export async function analyzeText(text: string) {
  if (typeof text !== 'string' || !text.trim())
    throw new Error('상품 정보를 입력해주세요.');
  return request('/voice/analyze', { text: text.trim() });
}
export async function analyzeAudio(audio: RecordedAudio) {
  return request(
    '/voice/product-registration',
    await audioBody(audio, 'audio_file'),
  );
}
export async function answerText(command: VoiceCommand, text: string) {
  waiting(command);
  if (!text.trim()) throw new Error('답변을 입력해주세요.');
  if (text.trim().length > 2000)
    throw new Error('답변은 2,000자 이내로 입력해주세요.');
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
    { listing_id: String(listingId) },
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
    !['READY', 'NEEDS_CONFIRMATION'].includes(command.status) ||
    command.needs_confirmation === false ||
    (command.missing_fields?.length ?? 0) > 0 ||
    !command.execution_endpoint ||
    !executionPaths.includes(
      command.execution_endpoint as (typeof executionPaths)[number],
    )
  )
    throw new Error('최종 반영 정보를 확인할 수 없어 실행하지 않았어요.');
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
    if (text.includes('조회') || text.trim() === '취소')
      throw new CommandError(
        422,
        'ANALYSIS_FAILED',
        '상품 등록·수정 등 처리할 내용을 말해주세요.',
      );
    const status: CommandStatus = text.includes('질문')
      ? 'NEEDS_INPUT'
      : text.includes('후보')
        ? 'NEEDS_SELECTION'
        : 'READY';
    const deleting = text.includes('삭제');
    const intent = deleting
      ? 'PRODUCT_DELETE'
      : text.includes('품절')
        ? 'SOLD_OUT'
        : text.includes('할인')
          ? text.includes('종료')
            ? 'SALE_DELETE'
            : text.includes('수정')
              ? 'SALE_UPDATE'
              : 'SALE_CREATE'
          : text.includes('등록')
            ? 'PRODUCT_CREATE'
            : 'PRODUCT_UPDATE';
    const saleIntent = intent === 'SALE_CREATE' || intent === 'SALE_UPDATE';
    const endpoint: Record<string, string> = {
      PRODUCT_CREATE: registrationConfirmEndpoint,
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
        status === 'READY' ? (endpoint[intent] ?? null) : null,
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
              effective_price: saleIntent ? 4800 : 6000,
              sale_active: saleIntent,
              sale_quantity: 3,
              sale_unit: '개',
              stock_quantity: 8,
            },
      },
      result: null,
      analysis_result: {
        product_name: '사과',
        price: status === 'NEEDS_INPUT' ? null : 6000,
        effective_price:
          status === 'NEEDS_INPUT' ? null : saleIntent ? 4800 : 6000,
        sale_active: saleIntent,
        unit: '한 봉지',
        category: 'FRUIT',
        category_name: '과일',
      },
      missing_fields: status === 'NEEDS_INPUT' ? ['price'] : [],
      needs_confirmation: status === 'READY',
      question: status === 'NEEDS_INPUT' ? '가격을 얼마로 할까요?' : undefined,
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
      !['READY', 'NEEDS_CONFIRMATION'].includes(value.status)
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
  value.status = 'READY';
  value.execution_endpoint =
    value.intent === 'PRODUCT_CREATE'
      ? registrationConfirmEndpoint
      : '/voice/product-update';
  value.analysis_result = {
    ...value.analysis_result,
    price: 6000,
    effective_price: 6000,
  };
  value.missing_fields = [];
  value.needs_confirmation = true;
  value.question = undefined;
  value.candidates = [];
  value.message = '변경할 내용을 확인해주세요.';
  return clone(value);
}
