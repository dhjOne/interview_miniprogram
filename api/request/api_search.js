import http from '../api_request';

export const searchApi = {
  /** 搜索分类与题目 */
  search: (params, options = {}) =>
    http.get('/repository/search', params, {
      showLoading: false,
      ...options
    }),

  /** 查询搜索历史（需登录） */
  getHistory: (options = {}) =>
    http.get('/repository/search/history', null, {
      showLoading: false,
      ...options
    }),

  /** 保存搜索历史（需登录） */
  saveHistory: (keyword, options = {}) =>
    http.post('/repository/search/history', { keyword }, {
      showLoading: false,
      ...options
    }),

  /** 删除单条搜索历史 */
  deleteHistory: (id, options = {}) =>
    http.delete(`/repository/search/history/${id}`, null, {
      showLoading: false,
      ...options
    }),

  /** 清空搜索历史 */
  clearHistory: (options = {}) =>
    http.delete('/repository/search/history', null, {
      showLoading: false,
      ...options
    }),

  /** 热门搜索 */
  getPopular: (options = {}) =>
    http.get('/repository/search/popular', null, {
      showLoading: false,
      ...options
    })
};
