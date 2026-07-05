import Message from 'tdesign-miniprogram/message/index';
import { searchApi } from '~/api/request/api_search';

function formatDateYMD(value) {
  if (value === undefined || value === null || value === '') return '—';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const mo = `${m[2]}`.padStart(2, '0');
    const d = `${m[3]}`.padStart(2, '0');
    return `${m[1]}-${mo}-${d}`;
  }
  const d = new Date(s.replace(/-/g, '/'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10) || '—';
  const y = d.getFullYear();
  const mo = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function normalizeQuestionRow(row) {
  const difficulty = row.difficulty ?? row.difficultyLevel;
  let difficultyTag = null;
  const n = Number(difficulty);
  if (n === 1) difficultyTag = { text: '简单', theme: 'success' };
  else if (n === 2) difficultyTag = { text: '中等', theme: 'warning' };
  else if (n === 3) difficultyTag = { text: '困难', theme: 'danger' };
  const rawTime =
    row.updatedAt ?? row.updated_at ?? row.createdAt ?? row.created_at ?? row.createAt;
  return {
    ...row,
    difficultyTag,
    displayDate: formatDateYMD(rawTime),
    viewCount: row.viewCount ?? row.view_count ?? 0
  };
}

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
      wx.navigateBack({ delta: 1 });
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

      if (res.code !== '0000') {
        Message.error({
          context: this,
          offset: [20, 32],
          content: res.message || '搜索失败'
        });
        return;
      }

      const categories = res.data?.categories || [];
      const categoryTotal = res.data?.categoryTotal || categories.length;
      const questionPage = res.data?.questions || {};
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
      Message.error({
        context: this,
        offset: [20, 32],
        content: '网络错误，请重试'
      });
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
    wx.navigateTo({
      url: `/pages/question/index?categoryId=${id}&categoryName=${encodeURIComponent(name || '')}`
    });
  },

  onQuestionTap(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/question/detail/index?id=${id}&title=${encodeURIComponent(title || '')}`
    });
  },

  onReachBottom() {
    this.loadMore();
  }
});
