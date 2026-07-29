import http from '../api_request';

export const mobileAdminApi = {
  getOverview: () =>
    http.get('/mobile/admin/overview', null, {
      showLoading: false,
    }),

  getQuestions: (params) =>
    http.get('/mobile/admin/questions', params, {
      showLoading: false,
    }),

  approveQuestion: (questionId) =>
    http.post(`/mobile/admin/questions/${questionId}/approve`, null, {
      showLoading: true,
      loadingText: '通过中...',
    }),

  rejectQuestion: (questionId) =>
    http.post(`/mobile/admin/questions/${questionId}/reject`, null, {
      showLoading: true,
      loadingText: '驳回中...',
    }),

  getProfiles: (params) =>
    http.get('/mobile/admin/profiles', params, {
      showLoading: false,
    }),

  approveProfile: (userId) =>
    http.post(`/mobile/admin/profiles/${userId}/approve`, null, {
      showLoading: true,
      loadingText: '通过中...',
    }),

  rejectProfile: (params) =>
    http.post(`/mobile/admin/profiles/${params.userId}/reject`, params, {
      showLoading: true,
      loadingText: '驳回中...',
    }),

  resetProfile: (userId) =>
    http.post(`/mobile/admin/profiles/${userId}/reset`, null, {
      showLoading: true,
      loadingText: '重置中...',
    }),

  getCategorySuggestions: (params) =>
    http.get('/mobile/admin/category-suggestions', params, {
      showLoading: false,
    }),

  handleCategorySuggestion: (params) =>
    http.post(`/mobile/admin/category-suggestions/${params.suggestionId}/handle`, params, {
      showLoading: true,
      loadingText: '处理中...',
    }),
};
