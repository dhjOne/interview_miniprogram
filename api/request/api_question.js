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

  // 收藏/取消收藏分类
  toggleCollect: (params) => {
    return http.post('/repository/questions/collect', params, {
      showLoading: true,
      loadingText: '操作中...'
    })
  },

    // 获取题目详情
    getQuestionDetail: (params) => {
      return http.get(`/repository/questions/detail`, params, {
        showLoading: false
      })
    },
  
    // 获取相关题目
    getRelatedQuestions: (params) => {
      return http.get('/repository/questions/related', params, {
        showLoading: false
      })
    },
  
    // 获取题目评论
    getQuestionComments: (params) => {
      return http.get('/repository/questions/comments', params, {
        showLoading: false
      })
    },
  
    // 提交评论
    submitComment: (params) => {
      return http.post('/repository/questions/comments', params, {
        showLoading: true,
        loadingText: '发布中...'
      })
    },
  
    // 获取题目状态（点赞、收藏等）
    getQuestionStatus: (questionId) => {
      return http.get(`/repository/questions/${questionId}/status`, null, {
        showLoading: false
      })
    },
  
    // 点赞/取消点赞
    toggleLike: (params) => {
      return http.post('/repository/questions/like', params, {
        showLoading: true,
        loadingText: '操作中...'
      })
    },
  
    // 增加浏览量
    incrementViewCount: (questionId) => {
      return http.post(`/repository/questions/${questionId}/view`, null, {
        showLoading: false
      })
    },

    //发布问题
    publishQuestion: (publish) => {
      return http.post(`/repository/questions/publish`, publish, {
        showLoading: false
      })
    },

    //获得自己发布页面
    getPublishList: (questionParams) => {
      return http.get('/repository/publish/doc/list', questionParams, {
        showLoading: false
      })
    }


}