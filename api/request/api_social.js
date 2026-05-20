import http from '../api_request';

/**
 * 用户社交统计（关注 / 粉丝 / 主页访问 / 排名摘要）
 * 后端建议路径：/repository/user/social/*
 */
export const socialApi = {
  getSummary: () =>
    http.get('/repository/user/social/summary', null, {
      showLoading: false
    }),

  getFollowingList: (params) =>
    http.get('/repository/user/social/following', params, {
      showLoading: false
    }),

  getFollowersList: (params) =>
    http.get('/repository/user/social/followers', params, {
      showLoading: false
    }),

  getVisitsList: (params) =>
    http.get('/repository/user/social/visits', params, {
      showLoading: false
    })
};
