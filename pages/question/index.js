// pages/question/index.js
import Message from 'tdesign-miniprogram/message/index';
import { questionApi, unwrapData, handleApiError } from '~/api/index';
import {
  QuestionLikeOrCollectParams,
  QuestionParams
} from '~/api/param/param_question';
import {
  dismissBannerItemToday,
  dismissBannerToday,
  fetchBannersByPosition,
  filterDismissedBanners,
  interleaveFeedItems,
  isBannerDismissedToday,
  openBannerLink,
  POSITION_QUESTION_FEED,
  POSITION_QUESTION_TOP
} from '~/utils/banners';
import { normalizeQuestionRow, safeDecodeURIComponent } from '~/utils/questionList';


const app = getApp();

Page({
  data: {
    searchValue: '',
    sortType: 'default',
    sortChips: [
      { label: '综合', value: 'default' },
      { label: '最新', value: 'latest' },
      { label: '最热', value: 'hot' }
    ],
    displayList: [],
    questionCount: 0,
    topBanner: null,
    totalCount: 0,
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    showBackTop: false,
    categoryId: null,
    categoryName: '',
    scrollIntoView: '',
    listHeaderReady: false,
    sortThumbWidth: 33.333,
    sortThumbOffset: 0,
    sortSwipePulse: false
  },

  _sortSwipeTouch: null,
  _questions: [],
  _feedAds: [],

  onLoad(options) {
    const { categoryId, categoryName, secondaryCategoryId, secondaryCategoryName, keyword, search } = options;
    const finalCategoryId = categoryId || secondaryCategoryId;
    const finalCategoryName = safeDecodeURIComponent(categoryName || secondaryCategoryName);
    const initialKeyword = safeDecodeURIComponent(keyword || search || '');

    this._skipShowRefresh = true;
    this._questions = [];
    this._feedAds = [];
    this.setData({
      categoryId: finalCategoryId,
      categoryName: finalCategoryName,
      searchValue: initialKeyword
    });

    wx.setNavigationBarTitle({
      title: finalCategoryName || '题库列表'
    });

    this._updateSortThumb(this.data.sortType);
    this.loadOpsSlots();
    this.loadQuestions(true);
  },

  onShow() {
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    // 从题目详情返回时刷新列表（点赞/收藏等状态）
    this.loadQuestions(true);
  },

  onReady() {
    if (this.data.categoryName) {
      wx.setNavigationBarTitle({
        title: this.data.categoryName
      });
    }
  },

  onPullDownRefresh() {
    return Promise.all([this.loadOpsSlots(), this.loadQuestions(true)]);
  },

  onPageScroll(e) {
    const top = (e.detail && e.detail.scrollTop) || 0;
    this.setData({
      showBackTop: top > 400
    });
  },

  async loadOpsSlots() {
    const [feedAds, topList] = await Promise.all([
      fetchBannersByPosition(POSITION_QUESTION_FEED),
      fetchBannersByPosition(POSITION_QUESTION_TOP)
    ]);
    this._feedAds = filterDismissedBanners(feedAds || []);
    const topBanner =
      !isBannerDismissedToday(POSITION_QUESTION_TOP) && topList && topList.length
        ? topList[0]
        : null;
    this.setData({ topBanner });
    this._rebuildDisplayList();
  },

  _rebuildDisplayList() {
    const searching = !!(this.data.searchValue && this.data.searchValue.trim());
    const displayList = interleaveFeedItems(this._questions, this._feedAds, {
      every: searching ? 12 : 10,
      minBeforeFirst: 4,
      idPrefix: 'q-ad'
    });
    this.setData({
      displayList,
      questionCount: this._questions.length
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
    if (this.data.loading && !refresh) return;

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

      const response = await questionApi.getQuestionList(questionParams);
      const data = unwrapData(response) || {};
      const rawList = data.rows || [];
      const total = data.total || 0;
      const newList = rawList.map(normalizeQuestionRow);

      if (refresh) {
        this._questions = newList;
        this.setData({
          totalCount: total,
          page: 1,
          hasMore: newList.length < total
        });
      } else {
        this._questions = [...this._questions, ...newList];
        this.setData({
          totalCount: total,
          page: requestPage,
          hasMore: this._questions.length < total
        });
      }
      this._rebuildDisplayList();
    } catch (error) {
      console.error('加载题目列表失败:', error);
      handleApiError(error, { fallbackMessage: '网络错误，请重试' });
    } finally {
      this.setData({ loading: false, listHeaderReady: true });
    }
  },

  onOpsBannerTap(e) {
    const item = (e.detail && e.detail.item) || e.currentTarget?.dataset?.item;
    openBannerLink(item);
  },

  onTopBannerDismiss() {
    dismissBannerToday(POSITION_QUESTION_TOP);
    this.setData({ topBanner: null });
  },

  onFeedBannerDismiss(e) {
    const item = (e.detail && e.detail.item) || null;
    if (!item || item.id == null) return;
    dismissBannerItemToday(item.id);
    this._feedAds = filterDismissedBanners(this._feedAds || []);
    this._rebuildDisplayList();
  },

  onSearchChange(e) {
    this.setData({
      searchValue: e.detail.value || ''
    });
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
      /* translateX 百分比相对滑块自身宽度，每档移动 100% */
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

  async onCollect(e) {
    const questionId = e.currentTarget.dataset.id;
    const question = this._questions.find((item) => item.id === questionId);
    if (!question) return;

    try {
      const collectQuestion = new QuestionLikeOrCollectParams(questionId, null, !question.isCollected)
      await questionApi.toggleCollect(collectQuestion);
      this._questions = this._questions.map((item) => {
        if (item.id === questionId) {
          return { ...item, isCollected: !item.isCollected };
        }
        return item;
      });
      this._rebuildDisplayList();
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 2000,
        content: question.isCollected ? '已取消收藏' : '收藏成功'
      });
    } catch (error) {
      console.error('收藏操作失败:', error);
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
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
    app.navigateToLogin({
      url: `/pages/publish/index${q}`
    });
  },

  onReleaseTap() {
    this.goRelease();
  },

  onQuestionClick(e) {
    const questionId = e.currentTarget.dataset.id;
    const questionTitle = e.currentTarget.dataset.title || '';
    const { categoryId, categoryName } = this.data;
    let url = `/pages/question/detail/index?id=${questionId}&title=${encodeURIComponent(questionTitle)}`;
    if (categoryId) {
      url += `&categoryId=${categoryId}&categoryName=${encodeURIComponent(categoryName || '')}`;
    }
    app.navigateToLogin({ url });
  }
});
