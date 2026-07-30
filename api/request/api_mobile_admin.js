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

  rejectQuestion: (questionId, params) =>
    http.post(`/mobile/admin/questions/${questionId}/reject`, params || {}, {
      showLoading: true,
      loadingText: '驳回中...',
    }),

  offlineQuestion: (questionId) =>
    http.post(`/mobile/admin/questions/${questionId}/offline`, null, {
      showLoading: true,
      loadingText: '下架中...',
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

  getReports: (params) =>
    http.get('/mobile/admin/reports', params, {
      showLoading: false,
    }),

  handleReport: (reportId, params) =>
    http.post(`/mobile/admin/reports/${reportId}/handle`, params, {
      showLoading: true,
      loadingText: '处理中...',
    }),

  getComments: (params) =>
    http.get('/mobile/admin/comments', params, {
      showLoading: false,
    }),

  hideComment: (commentId) =>
    http.post(`/mobile/admin/comments/${commentId}/hide`, null, {
      showLoading: true,
      loadingText: '隐藏中...',
    }),

  getBusinessLeads: (params) =>
    http.get('/mobile/admin/business-leads', params, {
      showLoading: false,
    }),

  handleBusinessLead: (leadId, params) =>
    http.post(`/mobile/admin/business-leads/${leadId}/handle`, params, {
      showLoading: true,
      loadingText: '处理中...',
    }),

  getAppeals: (params) =>
    http.get('/mobile/admin/appeals', params, {
      showLoading: false,
    }),

  resolveAppeal: (params) =>
    http.post('/mobile/admin/appeals/resolve', params, {
      showLoading: true,
      loadingText: '处理中...',
    }),
};
