import http from '../api_request'

export const questionApi = {

  // 获取题目列表
  getQuestionList: (questionParams) => http.get('/repository/questions', questionParams, {
      showLoading: false
    }),

  // 收藏/取消收藏分类
  toggleCollect: (params) => http.post('/repository/questions/collect', params, {
      showLoading: true,
      loadingText: '操作中...'
    }),

    // 获取题目详情
    getQuestionDetail: (params) => http.get(`/repository/questions/detail`, params, {
        showLoading: false
      }),
  
    // 获取相关题目
    getRelatedQuestions: (params) => http.get('/repository/questions/related', params, {
        showLoading: false
      }),
  
    // 获取题目评论（支持 page / limit 分页）
    getQuestionComments: (questionId, query = null) => http.get(`/comments/question/${questionId}`, query, {
        showLoading: false
      }),

    // 统计题目评论总数
    getQuestionCommentCount: (questionId) => http.get(`/comments/question/${questionId}/count`, null, {
        showLoading: false
      }),

    // 获取评论回复
    getCommentReplies: (parentId) => http.get(`/comments/replies/${parentId}`, null, {
        showLoading: false
      }),
  
    // 发布评论
    submitComment: (params) => http.post('/comments/publish', params, {
        showLoading: true,
        loadingText: '发布中...'
      }),

    // 点赞/取消点赞评论
    likeComment: (params) => http.post('/comments/like', params, {
        showLoading: false
      }),
  
    // 获取题目状态（点赞、收藏等）
    getQuestionStatus: (questionId) => http.get(`/repository/questions/${questionId}/status`, null, {
        showLoading: false
      }),
  
    // 点赞/取消点赞
    toggleLike: (params) => http.post('/repository/questions/like', params, {
        showLoading: true,
        loadingText: '操作中...'
      }),
  
    // 增加浏览量
    incrementViewCount: (questionId) => http.post(`/repository/questions/${questionId}/view`, null, {
        showLoading: false
      }),

    // 发布问题
    publishQuestion: (publish) => http.post(`/repository/questions/publish`, publish, {
        showLoading: false
      }),

    // 获得自己发布页面
    getPublishList: (questionParams) => http.get('/repository/publish/doc/list', questionParams, {
        showLoading: false
      }),

    /** 发布管理-文档分类（树形：id / name / parentId） */
    getPublishDocCategories: () => http.get('/repository/publish/doc/categories', null, {
        showLoading: false
      }),

    /** 发布管理-删除文档 */
    deletePublishDoc: (questionId) => http.post(`/repository/questions/${questionId}/unpublish`, null, {
        showLoading: true,
        loadingText: '删除中...'
      }),

    /**
     * 刷题排行榜（需后端提供 GET /repository/practice/ranking）
     * 单条可包含：rank, nickname, avatar, practiceCount | answerCount | score 等
     */
    getPracticeRanking: (params) => http.get('/repository/practice/ranking', params, {
        showLoading: false
      })

}