import http from '../api_request'
import config from '../../config/index'

export const categoryApi = {
  
  // 获取分类信息
  // @param {Object} categoryParams - 分类查询参数
  getCategories: (categoryParams, options = {}) => {
    const scope = categoryParams?.scope
    const url = scope === 'career'
      ? '/repository/category/career'
      : '/repository/category'
    if (config.features && config.features.enableDebug) {
      console.log('[api_category] getCategories scope=', scope, '→', url)
    }
    return http.get(url, categoryParams, {
      showLoading: false,
      ...options
    })
  },
  getQuestions: (categoryParams, options = {}) => http.get('/repository/questions', categoryParams, {
      showLoading: false,
      ...options
    }),
  /** 提交分类建议（找不到合适分类时） */
  suggestCategory: (suggestParams, options = {}) => http.post('/repository/categories/suggest', suggestParams, {
      showLoading: false,
      ...options
    })
}