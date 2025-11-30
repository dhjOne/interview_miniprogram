import { BaseParams } from './param_base'
import { PaginationParams } from './param_base'
import { SortParams } from './param_base'

//问题参数
export class QuestionParams extends SortParams  {
  constructor(title, categoryId, questionId) {
    super()
    this.title = title
    this.categoryId = categoryId
    this.questionId = questionId
  }
  
  // 转换为请求数据
  toRequestData() {
    return {
      title: this.title,
      categoryId: this.categoryId,
      questionId: this.questionId,
      page: this.page,
      limit: this.limit,
      sortField: this.sortField,
      order: this.order
    }
  }
}

//点赞收藏参数
export class QuestionLikeOrCollectParams extends BaseParams {
  constructor(questionId, like, collect) {
    super()
    this.questionId = questionId
    this.like = like
    this.collect = collect
  }
  
  // 转换为请求数据
  toRequestData() {
    return {
      questionId: this.questionId,
      like: this.like,
      collect: this.collect
    }
  }
}