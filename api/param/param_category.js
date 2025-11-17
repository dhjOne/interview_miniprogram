import { BaseParams } from './param_base'
import { PaginationParams } from './param_base'
import { SortParams } from './param_base'

/**
 * 分类参数
 */
export class CategoryParams extends PaginationParams {
  constructor(name, categoryId) {
    super()
    this.name = name
    this.categoryId = categoryId
  }
  
  // 转换为请求数据
  toRequestData() {
    return {
      name: this.name,
      categoryId: this.categoryId
    }
  }
}

//问题参数
export class QuestionParams extends PaginationParams {
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
      questionId: this.questionId
    }
  }
}