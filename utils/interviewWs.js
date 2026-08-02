/**
 * 面试 Agent WebSocket 客户端（Header 鉴权，禁止 query 传 token）
 */
import config from '../config/index';

function getAccessToken() {
  try {
    return wx.getStorageSync('access_token') || '';
  } catch (e) {
    return '';
  }
}

function buildWsUrl() {
  const base = (config.baseUrl || '').replace(/\/$/, '');
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/ws/interview`;
}

function createSessionId() {
  return `interview_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createInterviewSocket(options = {}) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('未登录，无法开启面试');
  }

  let sessionId = options.sessionId || createSessionId();
  let socketTask = null;
  let closed = false;
  let opened = false;

  const header = {
    Authorization: `Bearer ${token}`,
    'X-Access-Token': token,
    'X-Session-Id': sessionId,
  };

  socketTask = wx.connectSocket({
    url: buildWsUrl(),
    header,
    fail: (err) => {
      if (options.onError) options.onError((err && err.errMsg) || 'WebSocket 连接失败');
    },
  });

  socketTask.onOpen(() => {
    opened = true;
    if (options.onOpen) options.onOpen({ sessionId });
  });

  socketTask.onMessage((res) => {
    const text = typeof res.data === 'string' ? res.data : '';
    if (!text) return;
    if (text.startsWith('[META]')) {
      try {
        const meta = JSON.parse(text.slice(6));
        if (meta && meta.sessionId) {
          sessionId = meta.sessionId;
        }
        if (options.onMeta) options.onMeta(meta || {});
      } catch (e) {
        // ignore malformed meta
      }
      return;
    }
    if (text.startsWith('[ERROR]')) {
      if (options.onError) options.onError(text.replace(/^\[ERROR\]\s*/, ''));
      return;
    }
    if (text === '[DONE]') {
      if (options.onDone) options.onDone();
      return;
    }
    if (options.onMessage) options.onMessage(text);
  });

  socketTask.onError((err) => {
    if (options.onError) options.onError((err && err.errMsg) || 'WebSocket 异常');
  });

  socketTask.onClose(() => {
    closed = true;
    opened = false;
    if (options.onClose) options.onClose();
  });

  return {
    send(content) {
      if (closed || !socketTask) {
        throw new Error('连接已关闭');
      }
      if (!opened) {
        throw new Error('连接尚未就绪');
      }
      socketTask.send({ data: String(content || '') });
    },
    close() {
      closed = true;
      if (socketTask) {
        try {
          socketTask.close({});
        } catch (e) {
          // ignore
        }
      }
    },
    getSessionId() {
      return sessionId;
    },
    isOpen() {
      return opened && !closed;
    },
  };
}

export { createSessionId, buildWsUrl };

export default {
  createInterviewSocket,
  createSessionId,
  buildWsUrl,
};
