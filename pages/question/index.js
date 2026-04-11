// pages/question/index.js
import Message from 'tdesign-miniprogram/message/index';
import { authApi } from '~/api/request/api_question';
import { QuestionParams } from '~/api/param/param_question';

const app = getApp();

/** 列表卡片日期：仅展示 YYYY-MM-DD */
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
  const isCollected = !!(row.isCollected ?? row.collected);
  const difficulty = row.difficulty ?? row.difficultyLevel;
  let difficultyTag = null;
  const n = Number(difficulty);
  if (n === 1) difficultyTag = { text: '简单', theme: 'success' };
  else if (n === 2) difficultyTag = { text: '中等', theme: 'warning' };
  else if (n === 3) difficultyTag = { text: '困难', theme: 'danger' };
  const rawTime =
    row.updatedAt ?? row.updated_at ?? row.createdAt ?? row.created_at ?? row.createAt;
  const displayDate = formatDateYMD(rawTime);
  const viewCount = row.viewCount ?? row.view_count ?? 0;
  const commentCount = row.commentCount ?? row.comment_count ?? 0;
  const likeCount = row.likeCount ?? row.like_count ?? 0;
  return {
    ...row,
    isCollected,
    difficultyTag,
    displayDate,
    viewCount,
    commentCount,
    likeCount
  };
}

Page({
  data: {
    searchValue: '',
    sortType: 'default',
    sortChips: [
      { label: '综合', value: 'default' },
      { label: '最新', value: 'latest' },
      { label: '最热', value: 'hot' }
    ],
    questionList: [],
    totalCount: 0,
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    showBackTop: false,
    categoryId: null,
    categoryName: '',
    scrollIntoView: '',
    listHeaderReady: false
  },

  onLoad(options) {
    const { categoryId, categoryName, secondaryCategoryId, secondaryCategoryName } = options;
    const finalCategoryId = categoryId || secondaryCategoryId;
    const finalCategoryName = categoryName || secondaryCategoryName;

    this.setData({
      categoryId: finalCategoryId,
      categoryName: finalCategoryName
    });

    wx.setNavigationBarTitle({
      title: finalCategoryName || '题库列表'
    });

    this.loadQuestions(true);
  },

  onReady() {
    if (this.data.categoryName) {
      wx.setNavigationBarTitle({
        title: this.data.categoryName
      });
    }
  },

  onPageScroll(e) {
    const top = (e.detail && e.detail.scrollTop) || 0;
    this.setData({
      showBackTop: top > 400
    });
  },

  _sortParams() {
    const map = {
      default: ['sort_order', 'asc'],
      latest: ['created_at', 'desc'],
      hot: ['view_count', 'desc']
    };
    return map[this.data.sortType] || map.default;
  },

  async loadQuestions(refresh = false) {
    if (this.data.loading) return;

    const requestPage = refresh ? 1 : this.data.page + 1;

    this.setData({ loading: true });

    try {
      const title = this.data.searchValue && this.data.searchValue.trim()
        ? this.data.searchValue.trim()
        : null;
      const questionParams = new QuestionParams(title, this.data.categoryId, null);
      const [sortField, order] = this._sortParams();
      questionParams.sortField = sortField;
      questionParams.order = order;
      questionParams.page = requestPage;
      questionParams.limit = this.data.pageSize;

      const response = await authApi.getQuestionList(questionParams);

      if (response.code == '0000') {
        const rawList = response.data.rows || [];
        const total = response.data.total || 0;
        const newList = rawList.map(normalizeQuestionRow);

        if (refresh) {
          this.setData({
            questionList: newList,
            totalCount: total,
            page: 1,
            hasMore: newList.length < total
          });
        } else {
          const merged = [...this.data.questionList, ...newList];
          this.setData({
            questionList: merged,
            totalCount: total,
            page: requestPage,
            hasMore: merged.length < total
          });
        }
      } else {
        Message.error({
          context: this,
          offset: [20, 32],
          content: response.message || '加载失败'
        });
      }
    } catch (error) {
      console.error('加载题目列表失败:', error);
      Message.error({
        context: this,
        offset: [20, 32],
        content: '网络错误，请重试'
      });
    } finally {
      this.setData({ loading: false, listHeaderReady: true });
    }
  },

  onSearchChange(e) {
    this.setData({
      searchValue: e.detail.value
    });
  },

  onSearch() {
    this.loadQuestions(true);
  },

  onSearchClear() {
    this.setData({ searchValue: '' }, () => {
      this.loadQuestions(true);
    });
  },

  onSortTap(e) {
    const { sort } = e.currentTarget.dataset;
    if (!sort || sort === this.data.sortType) return;
    this.setData({ sortType: sort }, () => {
      this.loadQuestions(true);
    });
  },

  async onCollect(e) {
    const questionId = e.currentTarget.dataset.id;
    const question = this.data.questionList.find((item) => item.id === questionId);
    if (!question) return;

    try {
      const response = await authApi.toggleCollect({
        questionId,
        collect: !question.isCollected
      });

      if (response.code == '0000') {
        const updatedList = this.data.questionList.map((item) => {
          if (item.id === questionId) {
            return { ...item, isCollected: !item.isCollected };
          }
          return item;
        });
        this.setData({ questionList: updatedList });
        Message.success({
          context: this,
          offset: [20, 32],
          duration: 2000,
          content: question.isCollected ? '已取消收藏' : '收藏成功'
        });
      } else {
        Message.error({
          context: this,
          offset: [20, 32],
          content: response.message || '操作失败'
        });
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
      Message.error({
        context: this,
        offset: [20, 32],
        content: '操作失败，请重试'
      });
    }
  },

  loadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadQuestions(false);
    }
  },

  scrollToTop() {
    this.setData({ scrollIntoView: 'list-top' });
    setTimeout(() => {
      this.setData({ scrollIntoView: '' });
    }, 200);
  },

  goRelease() {
    const id = this.data.categoryId;
    const q = id !== null && id !== undefined && id !== '' ? `?categoryId=${id}` : '';
    wx.navigateTo({
      url: `/pages/publish/index${q}`
    });
  },

  onReleaseTap() {
    this.goRelease();
  },

  onQuestionClick(e) {
    const questionId = e.currentTarget.dataset.id;
    const questionTitle = e.currentTarget.dataset.title || '';
    app.navigateToLogin({
      url: `/pages/question/detail/index?id=${questionId}&title=${encodeURIComponent(questionTitle)}`
    });
  }
});
