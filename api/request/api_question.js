// api/auth.js
import http from '../api_request'

export const authApi = {
  
  // 获取分类信息
  getCategories: () => {
    return http.get('/question', null, {
      showLoading: false
    })
  }
}