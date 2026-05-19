import http from '../api_request';

/**
 * AI 对话接口（后端路径可按实际调整）
 * @param {{ content: string, sessionId?: string }} params
 */
export const aiApi = {
  chat: (params, options = {}) =>
    http.post('/ai/chat', params, {
      showLoading: false,
      checkBusinessCode: true,
      ...options,
    }),
};
