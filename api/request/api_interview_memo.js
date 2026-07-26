import http from '../api_request';

export const interviewMemoApi = {
  getList: (params, options = {}) =>
    http.get('/repository/interview-memos', params, {
      showLoading: false,
      ...options
    }),

  getDetail: (id, options = {}) =>
    http.get(`/repository/interview-memos/${id}`, null, {
      showLoading: false,
      ...options
    }),

  create: (params, options = {}) =>
    http.post('/repository/interview-memos', params, {
      showLoading: true,
      loadingText: '保存中...',
      ...options
    }),

  update: (id, params, options = {}) =>
    http.put(`/repository/interview-memos/${id}`, params, {
      showLoading: true,
      loadingText: '保存中...',
      ...options
    }),

  remove: (id, options = {}) =>
    http.delete(`/repository/interview-memos/${id}`, null, {
      showLoading: true,
      loadingText: '删除中...',
      ...options
    }),

  getTags: (options = {}) =>
    http.get('/repository/interview-memos/tags', null, {
      showLoading: false,
      ...options
    })
};
