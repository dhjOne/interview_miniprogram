import http from '../api_request';

/**
 * 商务合作（免登录）
 */
export const businessApi = {
  getCooperation: () =>
    http.get('/repository/business/cooperation', null, {
      showLoading: false
    }),

  submitLead: (data) =>
    http.post('/repository/business/leads', data, {
      showLoading: true,
      loadingText: '提交中...'
    })
};
