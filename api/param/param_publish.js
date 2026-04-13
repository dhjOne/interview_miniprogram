
//问题参数
export class QuestionPublishParams {
  constructor(title, categoryId, content, previewFullContent, docId) {
    this.title = title
    this.categoryId = categoryId
    this.content = content
    this.previewFullContent = previewFullContent
    this.contentType = 'markdown'
    this.id = docId != null && docId !== '' ? docId : null
  }
  
  // 转换为请求数据
  toRequestData() {
    const body = {
      title: this.title,
      categoryId: this.categoryId,
      content: this.content,
      previewFullContent: this.previewFullContent,
      contentType: this.contentType
    }
    if (this.id != null && this.id !== '') {
      body.id = this.id
    }
    return body
  }
}

