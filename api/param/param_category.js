// param_category.js
import { BaseParams } from './param_base'
import { PaginationParams } from './param_base'
import { SortParams } from './param_base'

/**
 * 分类参数
 */
export class CategoryParams extends SortParams {
  constructor(name, categoryId) {
    super()
    this.name = name
    this.categoryId = categoryId
  }
  
  // 转换为请求数据
  toRequestData() {
    return {
      name: this.name,
      categoryId: this.categoryId,
      page: this.page,
      limit: this.limit,
      sortField: this.sortField,
      order: this.order
    }
  }
}

// 问题参数 - 增加页码相关属性
export class QuestionParams extends SortParams {
  constructor(title, categoryId, questionId) {
    super()
    this.title = title
    this.categoryId = categoryId
    this.questionId = questionId
    this.page = 1 // 默认从第一页开始
    this.limit = 10 // 每页数量
    this.hasMore = true // 是否有更多数据
  }
  
  // 重置页码
  resetPage() {
    this.page = 1
    this.hasMore = true
  }
  
  // 增加页码
  increasePage() {
    this.page += 1
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