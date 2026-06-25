// api/auth.js
import http from '../api_request'

export const authApi = {
  
  // 获取分类信息
  // @param {Object} categoryParams - 分类查询参数
  getCategories: (categoryParams, options = {}) => {
    const url = categoryParams?.scope === 'career'
      ? '/repository/category/career'
      : '/repository/category'
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
  }
}