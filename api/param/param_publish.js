
//问题参数
export class QuestionPublishParams {
  constructor(title, categoryId, content, previewFullContent) {
    this.title = title
    this.categoryId = categoryId
    this.content = content
    this.previewFullContent = previewFullContent
    this.contentType = 'markdown'
  }
  
  // 转换为请求数据
  toRequestData() {
    return {
      title: this.title,
      categoryId: this.categoryId,
      content: this.content,
      previewFullContent: this.previewFullContent,
      contentType: 'markdown'
    }
  }
}

