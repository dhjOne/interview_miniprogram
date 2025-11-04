/**
 * 基础请求参数类型
 */
export class BaseParams {
  constructor() {
    this.timestamp = Date.now()
    this.deviceType = 'mini-program'
    this.version = '1.0.0'
  }
}

/**
 * 分页参数
 */
export class PaginationParams {
  constructor(page = 1, size = 10) {
    this.page = page
    this.size = size
  }
  
  toQuery() {
    return {
      page: this.page,
      size: this.size
    }
  }
}

/**
 * 排序参数
 */
export class SortParams {
  constructor(field = 'createTime', order = 'desc') {
    this.field = field
    this.order = order
  }
  
  toQuery() {
    return {
      sortField: this.field,
      sortOrder: this.order
    }
  }
}