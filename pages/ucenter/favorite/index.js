import Message from 'tdesign-miniprogram/message/index';
import { questionApi, unwrapData, handleApiError } from '~/api/index';
import { QuestionParams, QuestionLikeOrCollectParams } from '~/api/param/param_question';
import { openPage } from '~/utils/router';

const app = getApp();

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
  const isCollected = !!(row.isCollected ?? row.collected ?? true);
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
    loadAttempted: false
  },

  onShow() {
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    this.loadQuestions(true);
  },

  onLoad() {
    this._skipShowRefresh = true;
    this.loadQuestions(true);
  },

  onPullDownRefresh() {
    return this.loadQuestions(true);
  },

  onReachBottom() {
    this.loadMore();
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
    if (!refresh && !this.data.hasMore) return;

    const requestPage = refresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const title =
        this.data.searchValue && this.data.searchValue.trim()
          ? this.data.searchValue.trim()
          : null;
      const questionParams = new QuestionParams(title, null, null, 'collected');
      const [sortField, order] = this._sortParams();
      questionParams.sortField = sortField;
      questionParams.order = order;
      questionParams.page = requestPage;
      questionParams.limit = this.data.pageSize;

      const response = await questionApi.getQuestionList(questionParams);
      const data = unwrapData(response) || {};
      const rawList = data.rows || [];
      const total = data.total || 0;
      const newList = rawList.map(normalizeQuestionRow);

      if (refresh) {
        this.setData({
          questionList: newList,
          totalCount: total,
          page: 1,
          hasMore: newList.length < total,
          loadAttempted: true
        });
      } else {
        const merged = [...this.data.questionList, ...newList];
        this.setData({
          questionList: merged,
          totalCount: total,
          page: requestPage,
          hasMore: merged.length < total,
          loadAttempted: true
        });
      }
    } catch (error) {
      console.error('收藏列表加载失败:', error);
      handleApiError(error, { fallbackMessage: '网络错误，请重试' });
      this.setData({ loadAttempted: true });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  onSearchChange(e) {
    this.setData({ searchValue: e.detail.value || '' });
  },

  triggerSearch(keyword) {
    const value = (keyword ?? this.data.searchValue ?? '').trim();
    this.setData({ searchValue: value }, () => {
      this.loadQuestions(true);
    });
  },

  onSearchSubmit(e) {
    this.triggerSearch(e.detail?.value);
  },

  onSearchAction() {
    this.triggerSearch(this.data.searchValue);
  },

  onSearchClear() {
    this.setData({ searchValue: '' }, () => {
      this.loadQuestions(true);
    });
  },

  onSortTap(e) {
    const sort = e.currentTarget.dataset.sort;
    if (!sort || sort === this.data.sortType) return;
    this.setData({ sortType: sort }, () => {
      this.loadQuestions(true);
    });
  },

  loadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadQuestions(false);
    }
  },

  async onCollect(e) {
    const questionId = e.currentTarget.dataset.id;
    const question = this.data.questionList.find((item) => item.id === questionId);
    if (!question) return;

    try {
      await questionApi.toggleCollect(
        new QuestionLikeOrCollectParams(questionId, null, !question.isCollected)
      );

      const isNowCollected = !question.isCollected;
      if (!isNowCollected) {
        const updatedList = this.data.questionList.filter((item) => item.id !== questionId);
        this.setData({
          questionList: updatedList,
          totalCount: Math.max(0, (this.data.totalCount || 1) - 1)
        });
      } else {
        const updatedList = this.data.questionList.map((item) => {
          if (item.id === questionId) {
            return { ...item, isCollected: true };
          }
          return item;
        });
        this.setData({ questionList: updatedList });
      }
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 2000,
        content: question.isCollected ? '已取消收藏' : '收藏成功'
      });
    } catch (err) {
      console.error('收藏操作失败:', err);
      handleApiError(err, { fallbackMessage: '操作失败，请重试' });
    }
  },

  onQuestionClick(e) {
    const questionId = e.currentTarget.dataset.id;
    const questionTitle = e.currentTarget.dataset.title || '';
    app.navigateToLogin({
      url: `/pages/question/detail/index?id=${questionId}&title=${encodeURIComponent(questionTitle)}`
    });
  },

  goBrowse() {
    openPage({ url: '/pages/category/index' });
  }
});
