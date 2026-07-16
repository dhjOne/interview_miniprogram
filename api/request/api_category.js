// api/auth.js
import http from '../api_request'

export const authApi = {
  
  // 获取分类信息
  // @param {Object} categoryParams - 分类查询参数
  getCategories: (categoryParams, options = {}) => {
    const scope = categoryParams?.scope
    const url = scope === 'career'
      ? '/repository/category/career'
      : '/repository/category'
    console.log('[api_category] getCategories scope=', scope, '→', url)
    return http.get(url, categoryParams, {
      showLoading: false,
      ...options
    })
  },
  getQuestions: (categoryParams, options = {}) => {
    return http.get('/repository/questions', categoryParams, {
      showLoading: false,
      ...options
    })
  },
  /** 提交分类建议（找不到合适分类时） */
  suggestCategory: (suggestParams, options = {}) => {
    return http.post('/repository/categories/suggest', suggestParams, {
      showLoading: false,
      ...options
    })
  }
}