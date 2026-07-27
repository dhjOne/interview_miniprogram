import http from '../api_request';

export const collectFolderApi = {
  list: (options = {}) =>
    http.get('/repository/collect-folders', null, {
      showLoading: false,
      ...options,
    }),

  create: (params, options = {}) =>
    http.post('/repository/collect-folders', params, {
      showLoading: true,
      loadingText: '创建中...',
      ...options,
    }),

  rename: (id, params, options = {}) =>
    http.put(`/repository/collect-folders/${id}`, params, {
      showLoading: true,
      loadingText: '保存中...',
      ...options,
    }),

  remove: (id, options = {}) =>
    http.delete(`/repository/collect-folders/${id}`, null, {
      showLoading: true,
      loadingText: '删除中...',
      ...options,
    }),

  moveCollect: (params, options = {}) =>
    http.post('/repository/questions/collect/move', params, {
      showLoading: true,
      loadingText: '移动中...',
      ...options,
    }),
};
