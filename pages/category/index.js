import Message from 'tdesign-miniprogram/message';
import { categoryApi, handleApiError } from '~/api/index';
import { CategoryParams } from '~/api/param/param_category';
import categoryOpsBehavior from './behaviors/ops';
import categoryScopeBehavior from './behaviors/scope';
import { decorateCategoryRows } from '~/utils/categoryDecorate';
import { openPage } from '~/utils/router';

const app = getApp();

/**
 * 题库 Tab
 * - behaviors/scope：职业 / 全部 scope
 * - behaviors/ops：顶部与信息流运营位
 * - 本文件：一二级分类加载与切换
 */
Page({
  behaviors: [categoryScopeBehavior, categoryOpsBehavior],

  data: {
    primaryCategories: [],
    secondaryCategories: [],
    currentPrimaryId: null,
    navBarHeight: 90,
    loading: false,
    messageOffset: 100,
    categoryLoading: false,
    secondaryPage: 1,
    secondaryPageSize: 20,
    secondaryTotal: 0,
    secondaryHasMore: true,
    secondaryLoadingMore: false,
  },

  _secondaryRows: [],
  _categoryFeedAds: [],

  onLoad(options = {}) {
    this._skipShowRefresh = true;
    this._secondaryRows = [];
    this._categoryFeedAds = [];
    this.calculateNavBarHeight();
    this.loadOpsSlots();
    this.initCategoryScope(options.scope).finally(() => this.loadPrimaryCategories());
  },

  async onPullDownRefresh() {
    await Promise.all([this.refreshProfessionScope(false), this.loadOpsSlots()]);
    return this.refreshCurrentData();
  },

  async onShow() {
    const prevScope = this.data.categoryScope;
    await this.refreshProfessionScope(false);

    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }

    if (this.data.categoryScope !== prevScope) {
      return;
    }

    await this.loadPrimaryCategories({ preserveSelection: true });
  },

  async refreshCurrentData() {
    try {
      this.setData({ loading: true });
      const ok = await this.loadPrimaryCategories({ preserveSelection: true });
      if (ok) {
        this.showSuccessMessage('数据已更新');
      }
    } catch (error) {
      console.error('刷新数据失败:', error);
      handleApiError(error, { fallbackMessage: '刷新失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * @param {{ preserveSelection?: boolean, scope?: string }} [opts]
   * @returns {Promise<boolean>}
   */
  async loadPrimaryCategories(opts = {}) {
    const preserveSelection = !!opts.preserveSelection;
    const scope = opts.scope || this.data.categoryScope;

    try {
      if (!preserveSelection) {
        this.setData({ loading: true });
      }

      const categoryParams = new CategoryParams(null, 0, scope);
      categoryParams.page = 1;
      categoryParams.limit = 100;
      categoryParams.sortField = 'sort_order';
      categoryParams.order = 'asc';
      const response = await categoryApi.getCategories(categoryParams);

      const primaryCategories = response.data?.rows || [];
      let currentPrimaryId = this.data.currentPrimaryId;

      if (preserveSelection && currentPrimaryId != null) {
        const stillExists = primaryCategories.some((c) => c.id == currentPrimaryId);
        if (!stillExists) {
          currentPrimaryId = primaryCategories[0]?.id ?? null;
        }
      } else {
        currentPrimaryId = primaryCategories[0]?.id ?? null;
      }

      this.setData({
        primaryCategories,
        currentPrimaryId,
      });

      if (currentPrimaryId) {
        await this.loadSecondaryCategories({ scope });
      } else {
        this.setData({
          secondaryCategories: [],
          secondaryDisplayList: [],
          categoryLoading: false,
          secondaryTotal: 0,
          secondaryHasMore: false,
          secondaryLoadingMore: false,
        });
        this._secondaryRows = [];
      }

      return true;
    } catch (error) {
      console.error('加载分类失败:', error);
      handleApiError(error, { fallbackMessage: '网络错误，请重试' });
      this._secondaryRows = [];
      this.setData({
        primaryCategories: [],
        secondaryCategories: [],
        secondaryDisplayList: [],
        currentPrimaryId: null,
        categoryLoading: false,
        secondaryTotal: 0,
        secondaryHasMore: false,
        secondaryLoadingMore: false,
      });
      return false;
    } finally {
      if (!preserveSelection) {
        this.setData({ loading: false });
      }
    }
  },

  /**
   * @param {{ refresh?: boolean, scope?: string }} [opts]
   */
  async loadSecondaryCategories(opts = {}) {
    const refresh = opts.refresh !== false;
    const parentId = this.data.currentPrimaryId;
    const requestScope = opts.scope || this.data.categoryScope;
    const nextPage = refresh ? 1 : this.data.secondaryPage + 1;

    if (
      !refresh &&
      (this.data.categoryLoading || this.data.secondaryLoadingMore || !this.data.secondaryHasMore)
    ) {
      return;
    }

    if (refresh) {
      this._secondaryRows = [];
      this.setData({
        secondaryCategories: [],
        secondaryDisplayList: [],
        secondaryPage: 1,
        secondaryTotal: 0,
        secondaryHasMore: true,
        secondaryLoadingMore: false,
        categoryLoading: true,
      });
    } else {
      this.setData({ secondaryLoadingMore: true });
    }

    if (!parentId) {
      this.setData({
        categoryLoading: false,
        secondaryLoadingMore: false,
        secondaryHasMore: false,
      });
      return;
    }

    try {
      const categoryParams = new CategoryParams(null, parentId, requestScope);
      categoryParams.sortField = 'sort_order';
      categoryParams.order = 'asc';
      categoryParams.page = nextPage;
      categoryParams.limit = this.data.secondaryPageSize;
      const response = await categoryApi.getCategories(categoryParams);

      if (parentId != this.data.currentPrimaryId || requestScope !== this.data.categoryScope) {
        return;
      }

      const rawRows = response.data?.rows || [];
      const newChunk = decorateCategoryRows(rawRows);
      const rawTotal = response.data?.total;
      const parsedTotal = Number(rawTotal);
      const hasTotal = rawTotal !== undefined && rawTotal !== null && !Number.isNaN(parsedTotal);
      this._secondaryRows = refresh ? newChunk : [...this._secondaryRows, ...newChunk];
      const secondaryHasMore = hasTotal
        ? this._secondaryRows.length < parsedTotal
        : rawRows.length >= this.data.secondaryPageSize;

      this.setData({
        secondaryCategories: this._secondaryRows,
        secondaryPage: nextPage,
        secondaryTotal: hasTotal ? parsedTotal : this._secondaryRows.length,
        secondaryHasMore,
        categoryLoading: false,
        secondaryLoadingMore: false,
      });
      this._rebuildSecondaryDisplay();
    } catch (error) {
      console.error('加载二级分类失败:', error);
      handleApiError(error, { fallbackMessage: '加载分类失败' });
      const patch = {
        categoryLoading: false,
        secondaryLoadingMore: false,
      };
      if (refresh) {
        this._secondaryRows = [];
        patch.secondaryCategories = [];
        patch.secondaryDisplayList = [];
        patch.secondaryTotal = 0;
        patch.secondaryHasMore = false;
      }
      this.setData(patch);
    }
  },

  loadMoreSecondaryCategories() {
    this.loadSecondaryCategories({ refresh: false });
  },

  calculateNavBarHeight() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();

    const navBarHeight =
      (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 + menuButtonInfo.height;

    const messageOffset = navBarHeight + 60;
    this.setData({
      navBarHeight,
      messageOffset,
    });

    wx.setStorageSync('navBarHeight', navBarHeight + 'rpx');
    wx.setStorageSync('statusBarHeight', systemInfo.statusBarHeight + 'px');
  },

  showSuccessMessage(content) {
    Message.success({
      content,
      offset: [this.data.messageOffset, 16],
      duration: 2000,
    });
  },

  async switchPrimaryCategory(e) {
    const raw = e.currentTarget.dataset.id;
    const categoryId = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isNaN(categoryId) || categoryId == this.data.currentPrimaryId) {
      return;
    }

    this.setData({
      currentPrimaryId: categoryId,
      secondaryCategories: [],
      secondaryDisplayList: [],
      secondaryPage: 1,
      secondaryTotal: 0,
      secondaryHasMore: true,
      secondaryLoadingMore: false,
      categoryLoading: true,
    });
    this._secondaryRows = [];

    try {
      await this.loadSecondaryCategories();
    } finally {
      this.setData({ categoryLoading: false });
    }
  },

  async switchSecondaryCategory(e) {
    const raw = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '';
    const categoryId = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isNaN(categoryId)) {
      return;
    }

    openPage({
      url: `/pages/question/index?categoryId=${categoryId}&categoryName=${encodeURIComponent(
        name,
      )}`,
    });
  },

  goRelease() {
    openPage({ url: '/pages/publish/index' });
  },

  onReleaseTap() {
    app.navigateToLogin({
      url: `/pages/publish/index`,
      fail(res) {
        console.error('跳转失败', res);
      },
    });
  },
});
