import Message from 'tdesign-miniprogram/message';
import { categoryApi, handleApiError } from '~/api/index';
import { CategoryParams } from '~/api/param/param_category';
import categoryOpsBehavior from './behaviors/ops';
import categoryScopeBehavior from './behaviors/scope';
import { decorateCategoryRows } from '~/utils/categoryDecorate';
import { openPage } from '~/utils/router';

const app = getApp();
const RAIL_COLLAPSED_KEY = 'category_rail_collapsed';
const TOC_HANDLE_TOP_KEY = 'category_toc_handle_top';
const TOC_HANDLE_DEFAULT_TOP = 50;
const TOC_HANDLE_DRAG_THRESHOLD = 6;

/**
 * 题库 Tab
 * - behaviors/scope：职业 / 全部 scope
 * - behaviors/ops：顶部与信息流运营位
 * - 本文件：一二级分类加载与切换、一级侧栏收缩
 */
Page({
  behaviors: [categoryScopeBehavior, categoryOpsBehavior],

  data: {
    primaryCategories: [],
    secondaryCategories: [],
    currentPrimaryId: null,
    currentPrimaryName: '',
    railCollapsed: false,
    tocHandleTop: TOC_HANDLE_DEFAULT_TOP,
    tocHandleDragging: false,
    navBarHeight: 90,
    loading: false,
    refreshing: false,
    messageOffset: 100,
    categoryLoading: false,
    secondaryPage: 1,
    secondaryPageSize: 20,
    secondaryTotal: 0,
    secondaryHasMore: true,
    secondaryLoadingMore: false,
    fabActions: [
      { key: 'memo', text: '新建速记', icon: 'edit-1' },
      { key: 'publish', text: '发布题目', icon: 'upload' },
    ],
  },

  _secondaryRows: [],
  _categoryFeedAds: [],

  onLoad(options = {}) {
    this._skipShowRefresh = true;
    this._secondaryRows = [];
    this._categoryFeedAds = [];
    this.calculateNavBarHeight();
    this.restoreRailCollapsed();
    this.restoreTocHandleTop();
    this.preloadQuestionPackage();
    this.loadOpsSlots();
    // 本地定 scope 后，分类与 profile 并行，避免串行瀑布
    this.bootstrapCategoryHome(options.scope);
  },

  /** 预下载问题列表分包，减少首次 navigateTo 时 routeDone 抢态 */
  preloadQuestionPackage() {
    if (typeof wx.preloadSubpackage !== 'function') return;
    try {
      wx.preloadSubpackage({ name: 'question' });
    } catch (e) {
      // ignore
    }
  },

  async onScrollRefresh() {
    this.setData({ refreshing: true });
    try {
      await Promise.all([this.refreshProfessionScope(false), this.loadOpsSlots()]);
      await this.refreshCurrentData();
    } finally {
      this.setData({ refreshing: false });
    }
  },

  async onShow() {
    // 首屏：onLoad 已 bootstrap，跳过 profile 双刷
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }

    const prevScope = this.data.categoryScope;
    await this.refreshProfessionScope(false);

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
        currentPrimaryName: this.resolvePrimaryName(primaryCategories, currentPrimaryId),
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
        currentPrimaryName: '',
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

  resolvePrimaryName(list, id) {
    if (id == null || !Array.isArray(list)) {
      return '';
    }
    const hit = list.find((item) => item.id == id);
    return (hit && hit.name) || '';
  },

  restoreRailCollapsed() {
    try {
      const stored = wx.getStorageSync(RAIL_COLLAPSED_KEY);
      if (stored === true || stored === '1' || stored === 1) {
        this.setData({ railCollapsed: true });
      }
    } catch (error) {
      // ignore storage read failure
    }
  },

  persistRailCollapsed(collapsed) {
    try {
      wx.setStorageSync(RAIL_COLLAPSED_KEY, collapsed ? 1 : 0);
    } catch (error) {
      // ignore storage write failure
    }
  },

  setRailCollapsed(collapsed) {
    if (!!collapsed === !!this.data.railCollapsed) {
      return;
    }
    this.setData({ railCollapsed: !!collapsed });
    this.persistRailCollapsed(!!collapsed);
    if (collapsed) {
      // 收起后预量布局，拖动更跟手
      setTimeout(() => this.measureTocHandleBounds(), 320);
    }
  },

  measureTocHandleBounds() {
    wx.createSelectorQuery()
      .in(this)
      .select('.category-layout')
      .boundingClientRect()
      .select('.category-toc-handle')
      .boundingClientRect()
      .exec((res) => {
        if (!res || !res[0] || !res[1] || !res[0].height) {
          return;
        }
        const nextBounds = {
          layoutTop: res[0].top,
          layoutH: res[0].height,
          handleH: res[1].height || 0,
        };
        this._tocBounds = nextBounds;
        if (this._tocDrag) {
          this._tocDrag.bounds = nextBounds;
        }
      });
  },

  toggleRailCollapsed() {
    this.setRailCollapsed(!this.data.railCollapsed);
  },

  expandRail() {
    this.setRailCollapsed(false);
  },

  clampTocHandleTop(top) {
    const num = Number(top);
    if (Number.isNaN(num)) {
      return TOC_HANDLE_DEFAULT_TOP;
    }
    return Math.min(92, Math.max(8, Math.round(num * 10) / 10));
  },

  restoreTocHandleTop() {
    try {
      const stored = wx.getStorageSync(TOC_HANDLE_TOP_KEY);
      if (stored === '' || stored == null) {
        return;
      }
      this.setData({ tocHandleTop: this.clampTocHandleTop(stored) });
    } catch (error) {
      // ignore storage read failure
    }
  },

  persistTocHandleTop(top) {
    try {
      wx.setStorageSync(TOC_HANDLE_TOP_KEY, this.clampTocHandleTop(top));
    } catch (error) {
      // ignore storage write failure
    }
  },

  onTocHandleTouchStart(e) {
    const touch = e.touches && e.touches[0];
    if (!touch) {
      return;
    }

    this._tocDrag = {
      startY: touch.clientY,
      startTop: this.data.tocHandleTop,
      moved: false,
      bounds: this._tocBounds || null,
    };

    // 每次按下刷新尺寸，避免高度变化后边界不准
    this.measureTocHandleBounds();
  },

  onTocHandleTouchMove(e) {
    const drag = this._tocDrag;
    if (!drag) {
      return;
    }

    const touch = e.touches && e.touches[0];
    if (!touch) {
      return;
    }

    const dy = touch.clientY - drag.startY;
    if (Math.abs(dy) > TOC_HANDLE_DRAG_THRESHOLD) {
      drag.moved = true;
      if (!this.data.tocHandleDragging) {
        this.setData({ tocHandleDragging: true });
      }
    }

    const bounds = drag.bounds || this._tocBounds;
    if (!bounds || !bounds.layoutH) {
      return;
    }

    const halfH = Math.min(bounds.handleH / 2, bounds.layoutH / 2);
    const startCenterY = bounds.layoutTop + (bounds.layoutH * drag.startTop) / 100;
    let nextCenterY = startCenterY + dy;
    const minY = bounds.layoutTop + halfH;
    const maxY = bounds.layoutTop + bounds.layoutH - halfH;
    nextCenterY = Math.min(maxY, Math.max(minY, nextCenterY));
    const nextTop = this.clampTocHandleTop(
      ((nextCenterY - bounds.layoutTop) / bounds.layoutH) * 100,
    );

    if (nextTop !== this.data.tocHandleTop) {
      this.setData({ tocHandleTop: nextTop });
    }
  },

  onTocHandleTouchEnd() {
    const drag = this._tocDrag;
    this._tocDrag = null;

    if (this.data.tocHandleDragging) {
      this.setData({ tocHandleDragging: false });
    }

    if (!drag) {
      return;
    }

    // 未明显移动视为点击，展开一级目录
    if (!drag.moved) {
      this.expandRail();
      return;
    }

    this.persistTocHandleTop(this.data.tocHandleTop);
  },

  onLayoutTouchStart(e) {
    const touch = e.touches && e.touches[0];
    if (!touch) {
      return;
    }
    this._swipe = {
      x: touch.clientX,
      y: touch.clientY,
      t: Date.now(),
    };
  },

  onLayoutTouchEnd(e) {
    const start = this._swipe;
    this._swipe = null;
    if (!start) {
      return;
    }

    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) {
      return;
    }

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const elapsed = Date.now() - start.t;

    // 仅识别明确的横向轻扫，避免和纵向滚动冲突
    if (elapsed > 480 || absX < 56 || absX < absY * 1.6) {
      return;
    }

    if (dx < 0 && !this.data.railCollapsed) {
      this.setRailCollapsed(true);
      return;
    }
    if (dx > 0 && this.data.railCollapsed) {
      this.setRailCollapsed(false);
    }
  },

  async switchPrimaryCategory(e) {
    const raw = e.currentTarget.dataset.id;
    const categoryId = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isNaN(categoryId) || categoryId == this.data.currentPrimaryId) {
      return;
    }

    this.setData({
      currentPrimaryId: categoryId,
      currentPrimaryName: this.resolvePrimaryName(this.data.primaryCategories, categoryId),
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

  switchSecondaryCategory(e) {
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

  onFabAction(e) {
    const key = (e.detail && e.detail.key) || '';
    if (key === 'memo') {
      app.navigateToLogin({
        url: '/pages/interviewMemo/edit/index',
        fail(res) {
          console.error('跳转新建速记失败', res);
        },
      });
      return;
    }
    if (key === 'publish') {
      this.onReleaseTap();
    }
  },

  onReleaseTap() {
    app.navigateToLogin({
      url: '/pages/publish/index',
      fail(res) {
        console.error('跳转发布失败', res);
      },
    });
  },
});
