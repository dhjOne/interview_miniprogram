// api/auth.js
import http from '../api_request'

export const authApi = {
  
  // 获取分类信息
  getCategories: (categoryParams) => {
    return http.get('/repository/category', categoryParams, {
      showLoading: false
    })
  },

  //获取问题列表
  getQuestions: (categoryParams) => {
    return http.get('/repository/category', categoryParams, {
      showLoading: false
    })
  }
}