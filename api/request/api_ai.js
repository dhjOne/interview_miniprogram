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

function decodeChunk(arrayBuffer) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer));
  }
  const bytes = new Uint8Array(arrayBuffer);
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
        if (res.statusCode !== 200) {
          handlers.onError && handlers.onError({ message: `请求失败：${res.statusCode}` });
        }
      },
      fail: (err) => {
        handlers.onError && handlers.onError(err);
      },
    });

    if (task && task.onChunkReceived) {
      task.onChunkReceived((res) => {
        buffer += decodeChunk(res.data);
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        frames.forEach((frame) => {
          if (!frame.trim()) return;
          const parsed = parseSseFrame(frame);
          const data = parseJson(parsed.data);
          if (parsed.event === 'meta') handlers.onMeta && handlers.onMeta(data);
          else if (parsed.event === 'token') handlers.onToken && handlers.onToken(data.delta || '');
          else if (parsed.event === 'done') handlers.onDone && handlers.onDone(data);
          else if (parsed.event === 'error') handlers.onError && handlers.onError(data);
        });
      });
    }
    return task;
  },
};
