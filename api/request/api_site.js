import http from '../api_request';

/**
 * 站点信息（免登录）
 * 后端：GET /repository/site/info
 */
export const siteApi = {
  getSiteInfo: () =>
    http.get('/repository/site/info', null, {
      showLoading: false
    })
};
