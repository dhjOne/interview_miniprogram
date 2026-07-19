import http from '../api_request';

/**
 * 运营位 Banner（免登录）
 * 后端：GET /repository/banners?position=MY_CAROUSEL
 */
export const bannerApi = {
  listByPosition: (position = 'MY_CAROUSEL') =>
    http.get('/repository/banners', { position }, {
      showLoading: false
    })
};
