import http from '../api_request';

/**
 * 积分中心（对接 interview-handbook-points AppPointController）
 */
export const pointsApi = {
  getAccount: () =>
    http.get('/points/account', null, { showLoading: false }),

  getLedger: (params) =>
    http.get('/points/ledger', params, { showLoading: false }),

  getRules: () =>
    http.get('/points/rules', null, { showLoading: false }),

  getRedeemItems: () =>
    http.get('/points/redeem/items', null, { showLoading: false }),

  redeem: (params) =>
    http.post('/points/redeem', params, {
      showLoading: true,
      loadingText: '兑换中...'
    }),

  getRedeemOrders: () =>
    http.get('/points/redeem/orders', null, { showLoading: false }),

  getAiQuota: () =>
    http.get('/points/redeem/ai-quota', null, { showLoading: false }),

  submitAppeal: (params) =>
    http.post('/points/appeals', params, {
      showLoading: true,
      loadingText: '提交中...'
    }),

  getAppeals: (params) =>
    http.get('/points/appeals', params, { showLoading: false }),

  bindInviteCode: (params) =>
    http.post('/points/invites/bind', params, {
      showLoading: true,
      loadingText: '绑定中...'
    }),

  getInviteCode: () =>
    http.get('/points/invites/code', null, { showLoading: false }),

  completeSelfQuiz: (params) =>
    http.post('/points/self-quiz/complete', params, {
      showLoading: true,
      loadingText: '提交中...'
    })
};
