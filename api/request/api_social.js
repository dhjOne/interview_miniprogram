import http from '../api_request';

/**
 * 用户社交统计（关注 / 粉丝 / 主页访问）
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
    }),

  /** 关注 / 取消关注用户 */
  toggleFollow: (params) => {
    // http.request expects param objects to expose toRequestData(),
    // wrap plain objects so calls like toggleFollow({ userId, follow }) work.
    const payload = params && typeof params.toRequestData === 'function'
      ? params
      : { toRequestData: () => (params || {}) };
    return http.post('/repository/user/social/follow', payload, {
      showLoading: true,
      loadingText: '操作中...'
    })
  },

  /** 提交举报 */
  submitReport: (params) => {
    const payload = params && typeof params.toRequestData === 'function'
      ? params
      : { toRequestData: () => (params || {}) };
    return http.post('/repository/user/social/report', payload, {
      showLoading: true,
      loadingText: '提交中...'
    });
  },

  /** 拉黑用户 */
  blockUser: (params) => {
    const payload = params && typeof params.toRequestData === 'function'
      ? params
      : { toRequestData: () => (params || {}) };
    return http.post('/repository/user/social/blacklist', payload, {
      showLoading: true,
      loadingText: '操作中...'
    });
  },

  /** 解除拉黑 */
  unblockUser: (userId) =>
    http.delete(`/repository/user/social/blacklist/${userId}`, null, {
      showLoading: true,
      loadingText: '操作中...'
    }),

  /** 我的黑名单 */
  getBlacklist: (params) =>
    http.get('/repository/user/social/blacklist', params, {
      showLoading: false
    }),

  /** 我的通知 */
  getNotifications: (params) =>
    http.get('/repository/user/social/notifications', params, {
      showLoading: false
    }),

  /** 标记通知已读 */
  markNotificationRead: (notificationId) =>
    http.post(`/repository/user/social/notifications/${notificationId}/read`, null, {
      showLoading: false
    }),

  /** 用户个人主页资料 */
  getUserProfile: (params) =>
    http.get('/repository/user/social/profile', params, {
      showLoading: false
    }),

  /** 用户发布的题目/文章列表 */
  getUserQuestions: (params) =>
    http.get('/repository/user/social/questions', params, {
      showLoading: false
    })
};
