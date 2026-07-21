import Message from 'tdesign-miniprogram/message/index';
import { searchApi, unwrapData, handleApiError } from '~/api/index';
import { normalizeQuestionRow } from '~/utils/questionList';
import { openPage, backPage } from '~/utils/router';

Page({
  data: {
    keyword: '',
    categories: [],
    categoryTotal: 0,
    questionList: [],
    questionTotal: 0,
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20
  },

  onLoad(options) {
    const keyword = decodeURIComponent(options.keyword || '').trim();
    if (!keyword) {
      backPage({ delta: 1 });
      return;
    }
    this.setData({ keyword });
    wx.setNavigationBarTitle({ title: `搜索：${keyword}` });
    this.loadSearch(true);
  },

  onPullDownRefresh() {
    return this.loadSearch(true);
  },

  async loadSearch(refresh = false) {
    if (this.data.loading) return;
    const requestPage = refresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const res = await searchApi.search({
        keyword: this.data.keyword,
        page: requestPage,
        limit: this.data.pageSize,
        categoryLimit: 10
      });

      const data = unwrapData(res) || {};
      const categories = data.categories || [];
      const categoryTotal = data.categoryTotal || categories.length;
      const questionPage = data.questions || {};
      const rawRows = questionPage.rows || [];
      const total = questionPage.total || 0;
      const newList = rawRows.map(normalizeQuestionRow);

      if (refresh) {
        this.setData({
          categories,
          categoryTotal,
          questionList: newList,
          questionTotal: total,
          page: 1,
          hasMore: newList.length < total
        });
      } else {
        const merged = [...this.data.questionList, ...newList];
        this.setData({
          questionList: merged,
          questionTotal: total,
          page: requestPage,
          hasMore: merged.length < total
        });
      }
    } catch (error) {
      console.error('[search-result] 搜索失败', error);
      handleApiError(error, { fallbackMessage: '网络错误，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  loadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadSearch(false);
    }
  },

  onCategoryTap(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;
    openPage({
      url: `/pages/question/index?categoryId=${id}&categoryName=${encodeURIComponent(name || '')}`
    });
  },

  onQuestionTap(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    openPage({
      url: `/pages/question/detail/index?id=${id}&title=${encodeURIComponent(title || '')}`
    });
  },

  onReachBottom() {
    this.loadMore();
  }
});
