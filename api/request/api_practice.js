import http from '../api_request';

export const practiceApi = {
  recordBrowse: (params) =>
    http.post('/repository/practice/browse', params, {
      showLoading: false
    }),

  getHistory: (params) =>
    http.get('/repository/practice/history', params, {
      showLoading: false
    }),

  removeHistory: (questionId) =>
    http.delete(`/repository/practice/history/${questionId}`, null, {
      showLoading: false
    }),

  clearHistory: () =>
    http.delete('/repository/practice/history', null, {
      showLoading: true,
      loadingText: '清空中...'
    }),

  getRanking: (params) =>
    http.get('/repository/practice/ranking', params, {
      showLoading: false
    })
};
