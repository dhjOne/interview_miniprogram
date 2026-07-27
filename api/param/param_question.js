import { BaseParams } from './param_base';
import { SortParams } from './param_base';

// 问题参数
export class QuestionParams extends SortParams {
  /**
   * @param {string|null} title
   * @param {string|null} categoryId
   * @param {string|null} questionId
   * @param {'collected'|'weak'|null} listScope 仅列表：收藏 / 生疏（需后端支持 onlyCollected / onlyWeak）
   * @param {string|number|null} collectFolderId 收藏分类筛选（仅 collected）
   */
  constructor(title, categoryId, questionId, listScope = null, collectFolderId = null) {
    super();
    this.title = title;
    this.categoryId = categoryId;
    this.questionId = questionId;
    this.listScope = listScope;
    this.collectFolderId = collectFolderId;
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
      order: this.order,
    };
    if (this.listScope === 'collected') o.collected = true;
    if (this.listScope === 'weak') o.onlyWeak = true;
    if (this.collectFolderId != null && this.collectFolderId !== '') {
      o.collectFolderId = this.collectFolderId;
    }
    return o;
  }
}

/** 刷题排行榜分页 */
export class PracticeRankingParams extends BaseParams {
  constructor(page = 1, limit = 30) {
    super();
    this.page = page;
    this.limit = limit;
  }

  toRequestData() {
    return { page: this.page, limit: this.limit };
  }
}

// 点赞收藏参数
export class QuestionLikeOrCollectParams extends BaseParams {
  /**
   * @param {string|number} questionId
   * @param {boolean|null} like
   * @param {boolean|null} collect
   * @param {string|number|null} folderId 收藏分类；收藏时可选
   */
  constructor(questionId, like, collect, folderId = null) {
    super();
    this.questionId = questionId;
    this.like = like;
    this.collect = collect;
    this.folderId = folderId;
  }

  // 转换为请求数据
  toRequestData() {
    const o = {
      questionId: this.questionId,
      like: this.like,
      collect: this.collect,
    };
    if (this.folderId != null && this.folderId !== '') {
      o.folderId = this.folderId;
    }
    return o;
  }
}
