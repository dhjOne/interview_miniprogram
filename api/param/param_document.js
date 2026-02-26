import { SortParams } from './param_base'

//问题参数
export class DocumentParams extends SortParams  {
  constructor(docType, timeRange, category) {
    super()
    this.docType = docType
    this.timeRange = timeRange
    this.categoryId = category
  }
  
  // 转换为请求数据
  toRequestData() {
    return {
      docType: this.docType,
      categoryId: this.categoryId,
      timeRange: this.timeRange,
      page: this.page,
      limit: this.limit,
      sortField: this.sortField,
      order: this.order
    }
  }
}
