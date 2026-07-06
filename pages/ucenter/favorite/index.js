import Message from 'tdesign-miniprogram/message/index';
import { authApi } from '~/api/request/api_question';
import { QuestionParams, QuestionLikeOrCollectParams } from '~/api/param/param_question';

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
    listHeaderReady: false,
    scrollIntoView: '',
    loadAttempted: false,
    sortThumbWidth: 33.333,
    sortThumbOffset: 0,
    sortSwipePulse: false
  },

  _sortSwipeTouch: null,

  onShow() {},

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
      const questionParams = new QuestionParams(title, null, null, 'collected');
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
      } else {
        Message.error({
          context: this,
          offset: [20, 32],
          content: response.message || '加载失败'
        });
        this.setData({ loadAttempted: true });
      }
    } catch (error) {
      console.error('收藏列表加载失败:', error);
      Message.error({
        context: this,
        offset: [20, 32],
        content: '网络错误，请重试'
      });
      this.setData({ loadAttempted: true });
    } finally {
      this.setData({ loading: false, listHeaderReady: true });
      wx.stopPullDownRefresh();
    }
  },

  onLoad() {
    this._updateSortThumb(this.data.sortType);
    this.loadQuestions(true);
  },

  onPullDownRefresh() {
    return this.loadQuestions(true);
  },

  onSearchChange(e) {
    this.setData({ searchValue: e.detail.value || '' });
  },

  triggerSearch(keyword) {
    const value = (keyword ?? this.data.searchValue ?? '').trim();
    this.setData({ searchValue: value, scrollIntoView: 'list-top' }, () => {
      this.loadQuestions(true);
      setTimeout(() => {
        this.setData({ scrollIntoView: '' });
      }, 300);
    });
  },

  onSearchSubmit(e) {
    this.triggerSearch(e.detail?.value);
  },

  onSearchAction() {
    this.triggerSearch(this.data.searchValue);
  },

  onSearchClear() {
    this.setData({ searchValue: '', scrollIntoView: 'list-top' }, () => {
      this.loadQuestions(true);
      setTimeout(() => {
        this.setData({ scrollIntoView: '' });
      }, 300);
    });
  },

  _sortValues() {
    return this.data.sortChips.map((c) => c.value);
  },

  _sortIndex(sortType) {
    const idx = this._sortValues().indexOf(sortType);
    return idx < 0 ? 0 : idx;
  },

  _updateSortThumb(sortType) {
    const count = this.data.sortChips.length || 3;
    const idx = this._sortIndex(sortType);
    this.setData({
      sortThumbWidth: 100 / count,
      sortThumbOffset: idx * 100
    });
  },

  _pulseSortSegment() {
    this.setData({ sortSwipePulse: true });
    clearTimeout(this._sortPulseTimer);
    this._sortPulseTimer = setTimeout(() => {
      this.setData({ sortSwipePulse: false });
    }, 280);
  },

  applySort(sort, fromSwipe = false) {
    if (!sort || sort === this.data.sortType) return;
    this._updateSortThumb(sort);
    if (fromSwipe) {
      this._pulseSortSegment();
      wx.vibrateShort({ type: 'light' });
    }
    this.setData({ sortType: sort, scrollIntoView: 'list-top' }, () => {
      this.loadQuestions(true);
      setTimeout(() => {
        this.setData({ scrollIntoView: '' });
      }, 300);
    });
  },

  onSortTap(e) {
    this.applySort(e.currentTarget.dataset.sort, false);
  },

  onSortSwipeStart(e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this._sortSwipeTouch = {
      x: touch.clientX,
      y: touch.clientY
    };
  },

  onSortSwipeEnd(e) {
    const start = this._sortSwipeTouch;
    this._sortSwipeTouch = null;
    if (!start) return;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const SWIPE_MIN = 48;

    if (Math.abs(dx) < SWIPE_MIN) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.25) return;

    const order = this._sortValues();
    const cur = this._sortIndex(this.data.sortType);
    const next =
      dx < 0
        ? order[(cur + 1) % order.length]
        : order[(cur - 1 + order.length) % order.length];
    this.applySort(next, true);
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
      const response = await authApi.toggleCollect(
        new QuestionLikeOrCollectParams(questionId, null, !question.isCollected)
      );

      if (response.code == '0000') {
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
              return { ...item, isCollected: !item.isCollected };
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
      } else {
        Message.error({
          context: this,
          offset: [20, 32],
          content: response.message || '操作失败'
        });
      }
    } catch (err) {
      console.error('收藏操作失败:', err);
      Message.error({
        context: this,
        offset: [20, 32],
        content: '操作失败，请重试'
      });
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
    wx.switchTab({
      url: '/pages/category/index',
      fail: () => {
        wx.navigateTo({ url: '/pages/category/index' });
      }
    });
  }
});
