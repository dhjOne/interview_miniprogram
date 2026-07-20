import http from '../api_request';
import config from '../../config/index';

function encodeQuery(params = {}) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  return query ? `?${query}` : '';
}

function buildUrl(path) {
  const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
  const prefix = (config.apiPrefix || '/api').startsWith('/')
    ? config.apiPrefix || '/api'
    : `/${config.apiPrefix}`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${prefix}${normalizedPath}`;
}

function getTokenHeader() {
  try {
    const token = wx.getStorageSync('access_token');
    return token ? `Bearer ${token}` : '';
  } catch (e) {
    return '';
  }
}

function concatUint8(a, b) {
  if (!a.length) return b;
  if (!b.length) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** 从尾部截掉未收齐的 UTF-8 多字节序列，避免按 chunk 解码产生 */
function splitIncompleteUtf8Tail(bytes) {
  if (!bytes.length) return { complete: bytes, pending: new Uint8Array(0) };
  const maxCheck = Math.min(4, bytes.length);
  for (let i = 1; i <= maxCheck; i += 1) {
    const b = bytes[bytes.length - i];
    if ((b & 0x80) === 0) break;
    if ((b & 0xc0) !== 0x80) {
      const needed =
        (b & 0xe0) === 0xc0 ? 2 : (b & 0xf0) === 0xe0 ? 3 : (b & 0xf8) === 0xf0 ? 4 : 1;
      const startIdx = bytes.length - i;
      const have = bytes.length - startIdx;
      if (have < needed) {
        return {
          complete: bytes.slice(0, startIdx),
          pending: bytes.slice(startIdx),
        };
      }
      break;
    }
  }
  return { complete: bytes, pending: new Uint8Array(0) };
}

function utf8BytesToString(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  try {
    return decodeURIComponent(escape(binary));
  } catch (e) {
    return binary;
  }
}

/** 流式分片解码：跨 chunk 保留未完成的 UTF-8 字节 */
function createStreamDecoder() {
  if (typeof TextDecoder !== 'undefined') {
    const decoder = new TextDecoder('utf-8');
    return {
      decode(arrayBuffer) {
        return decoder.decode(new Uint8Array(arrayBuffer), { stream: true });
      },
      flush() {
        return decoder.decode();
      },
    };
  }
  let pending = new Uint8Array(0);
  return {
    decode(arrayBuffer) {
      const merged = concatUint8(pending, new Uint8Array(arrayBuffer));
      const { complete, pending: tail } = splitIncompleteUtf8Tail(merged);
      pending = tail;
      return utf8BytesToString(complete);
    },
    flush() {
      const tail = utf8BytesToString(pending);
      pending = new Uint8Array(0);
      return tail;
    },
  };
}

function parseSseFrame(frame) {
  const event = { event: 'message', data: '' };
  frame.split(/\r?\n/).forEach((line) => {
    if (line.startsWith('event:')) {
      event.event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      event.data += `${line.slice(5).trimStart()}\n`;
    }
  });
  event.data = event.data.trimEnd();
  return event;
}

function parseJson(data) {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch (e) {
    return { delta: data };
  }
}

/**
 * AI 对话接口（后端路径可按实际调整）
 * @param {{ content: string, sessionId?: string }} params
 */
export const aiApi = {
  chat: (params, options = {}) =>
    http.requestDirect({
      url: '/ai/chat',
      method: 'POST',
      data: params,
      showLoading: false,
      checkBusinessCode: true,
      ...options,
    }),

  search: ({ query, limit = 5 } = {}, options = {}) =>
    http.get(`/ai/search${encodeQuery({ query, limit })}`, null, {
      showLoading: false,
      checkBusinessCode: true,
      ...options,
    }),

  createConversation: (params = {}, options = {}) =>
    http.requestDirect({
      url: '/ai/conversations',
      method: 'POST',
      data: params,
      showLoading: false,
      checkBusinessCode: true,
      ...options,
    }),

  listConversations: (params = {}, options = {}) =>
    http.get(`/ai/conversations${encodeQuery(params)}`, null, {
      showLoading: false,
      checkBusinessCode: true,
      ...options,
    }),

  getMessages: (sessionId, options = {}) =>
    http.get(`/ai/conversations/${encodeURIComponent(sessionId)}/messages`, null, {
      showLoading: false,
      checkBusinessCode: true,
      ...options,
    }),

  deleteConversation: (sessionId, options = {}) =>
    http.requestDirect({
      url: `/ai/conversations/${encodeURIComponent(sessionId)}`,
      method: 'DELETE',
      showLoading: false,
      checkBusinessCode: true,
      ...options,
    }),

  listModels: (options = {}) =>
    http.get('/ai/models', null, {
      showLoading: false,
      checkBusinessCode: true,
      ...options,
    }),

  chatStream: (params, handlers = {}) => {
    let buffer = '';
    const streamDecoder = createStreamDecoder();

    const flushSseBuffer = (tail = '') => {
      buffer += tail;
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      frames.forEach((frame) => {
        if (!frame.trim()) return;
        const parsed = parseSseFrame(frame);
        const data = parseJson(parsed.data);
        if (parsed.event === 'meta' && handlers.onMeta) handlers.onMeta(data);
        else if (parsed.event === 'token' && handlers.onToken) handlers.onToken(data.delta || '');
        else if (parsed.event === 'done' && handlers.onDone) handlers.onDone(data);
        else if (parsed.event === 'error' && handlers.onError) handlers.onError(data);
      });
    };

    const task = wx.request({
      url: buildUrl('/ai/chat/stream'),
      method: 'POST',
      data: params,
      enableChunked: true,
      timeout: Math.max(config.timeout || 0, 120000),
      header: {
        'Content-Type': 'application/json',
        Authorization: getTokenHeader(),
      },
      success: (res) => {
        flushSseBuffer(streamDecoder.flush());
        if (res.statusCode !== 200) {
          if (handlers.onError) handlers.onError({ message: `请求失败：${res.statusCode}` });
        }
      },
      fail: (err) => {
        if (handlers.onError) handlers.onError(err);
      },
    });

    if (task && task.onChunkReceived) {
      task.onChunkReceived((res) => {
        flushSseBuffer(streamDecoder.decode(res.data));
      });
    }
    return task;
  },
};
