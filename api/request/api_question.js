// api/auth.js
import http from '../api_request'

// api_question.js
export const authApi = {

  // 获取题目列表
  getQuestionList: (questionParams) => {
    return http.get('/repository/questions', questionParams, {
      showLoading: false
    })
  },

  // 收藏/取消收藏题目
  toggleCollect: (params) => {
    return http.post('/repository/questions/collect', params, {
      showLoading: true,
      loadingText: '操作中...'
    })
  }
}