import { BaseParams } from './param_base'
import { SortParams } from './param_base'

//问题参数
export class QuestionParams extends SortParams  {
  /**
   * @param {string|null} title
   * @param {string|null} categoryId
   * @param {string|null} questionId
   * @param {'collected'|'weak'|null} listScope 仅列表：收藏 / 生疏（需后端支持 onlyCollected / onlyWeak）
   */
  constructor(title, categoryId, questionId, listScope = null) {
    super()
    this.title = title
    this.categoryId = categoryId
    this.questionId = questionId
    this.listScope = listScope
  }
  
  // 转换为请求数据
  toRequestData() {
    const o = {
      title: this.title,
      categoryId: this.categoryId,
      questionId: this.questionId,
      page: this.page,
      limit: this.limit,
      sortField: this.sortField,
      order: this.order
    }
    if (this.listScope === 'collected') o.collected = true
    if (this.listScope === 'weak') o.onlyWeak = true
    return o
  }
}

/** 刷题排行榜分页 */
export class PracticeRankingParams extends BaseParams {
  constructor(page = 1, limit = 30) {
    super()
    this.page = page
    this.limit = limit
  }

  toRequestData() {
    return { page: this.page, limit: this.limit }
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