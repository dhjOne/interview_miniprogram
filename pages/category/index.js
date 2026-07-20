import Message from 'tdesign-miniprogram/message';
import { categoryApi } from '~/api/index';
import { CategoryParams } from '~/api/param/param_category';
import { fetchPersonalInfo } from '~/utils/userProfile';
import { hasProfessionSelected } from '~/utils/profession';
import { navigateToProfessionPage } from '~/utils/professionNav';
import { getLocalSettings } from '~/utils/userSettings';
import {
  dismissBannerItemToday,
  dismissBannerToday,
  fetchBannersByPosition,
  filterDismissedBanners,
  interleaveFeedItems,
  isBannerDismissedToday,
  openBannerLink,
  POSITION_CATEGORY_FEED,
  POSITION_CATEGORY_TOP
} from '~/utils/banners';

const app = getApp();

const CATEGORY_SCOPE_INTENT_KEY = 'category_pending_scope';
const LIST_ICON_NAMES = [
  'code',
  'book',
  'chart-bubble',
  'wifi',
  'server',
  'layers',
  'mobile',
  'chat',
  'user',
  'file',
  'cpu',
  'logo-miniprogram',
  'system-sum',
  'root-list',
  'secured',
  'cloud'
];

const LIST_ICON_COLORS = [
  '#0052d9',
  '#366ef4',
  '#00a870',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#db2777',
  '#059669'
];

const LIST_ICON_BGS = [
  'rgba(0, 82, 217, 0.08)',
  'rgba(54, 110, 244, 0.08)',
  'rgba(0, 168, 112, 0.08)',
  'rgba(124, 58, 237, 0.08)',
  'rgba(8, 145, 178, 0.08)',
  'rgba(234, 88, 12, 0.08)',
  'rgba(219, 39, 119, 0.08)',
  'rgba(5, 150, 105, 0.08)'
];

function hashSeed(value) {
  const str = String(value ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function decorateCategoryRows(rows) {
  return (rows || []).map((row) => {
    const seed = hashSeed(row.id ?? row.name ?? 0);
    const index = seed % LIST_ICON_NAMES.length;
    const colorIndex = seed % LIST_ICON_COLORS.length;
    return {
      ...row,
      listIconName: LIST_ICON_NAMES[index],
      listIconColor: LIST_ICON_COLORS[colorIndex],
      listIconBg: LIST_ICON_BGS[colorIndex]
    };
  });
}

Page({
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
    categoryScope: 'all',
    isLoggedIn: false,
    hasProfession: false,
    categoryScopeTabs: [
      { label: '我的职业', value: 'career' },
      { label: '全部', value: 'all' }
    ],
    topBanner: null,
    secondaryDisplayList: []
  },

  _secondaryRows: [],
  _categoryFeedAds: [],

  onLoad(options = {}) {
    console.log('页面加载开始');
    this._skipShowRefresh = true;
    this._secondaryRows = [];
    this._categoryFeedAds = [];
    this.calculateNavBarHeight();
    this.loadOpsSlots();
    this.initCategoryScope(options.scope).finally(() => this.loadPrimaryCategories());

    this._onRefreshQuestionBank = this.handleRefresh.bind(this);
    app.on('refreshQuestionBank', this._onRefreshQuestionBank);
  },

  onUnload() {
    if (this._onRefreshQuestionBank) {
      app.off('refreshQuestionBank', this._onRefreshQuestionBank);
      this._onRefreshQuestionBank = null;
    }
  },

  handleRefresh() {
    console.log('收到刷新指令');
    if (this.data.currentPrimaryId) {
      this.refreshCurrentData();
    } else {
      this.loadPrimaryCategories();
    }
  },

  async onPullDownRefresh() {
    await Promise.all([this.refreshProfessionScope(false), this.loadOpsSlots()]);
    return this.refreshCurrentData();
  },

  async onShow() {
    console.log('页面显示');
    // 从个人中心选完职业返回时，会在此切到「我的职业」并重新拉分类
    const prevScope = this.data.categoryScope;
    await this.refreshProfessionScope(false);

    // 首次进入由 onLoad 负责拉数，避免与 onShow 重复请求
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }

    // 职业 scope 变化时 refreshProfessionScope 已重新拉分类
    if (this.data.categoryScope !== prevScope) {
      return;
    }

    // 每次切回题库 Tab 静默刷新，保证分类/题目数是最新的
    await this.loadPrimaryCategories({ preserveSelection: true });
  },

  async refreshCurrentData() {
    console.log('刷新当前页面数据');

    try {
      this.setData({ loading: true });
      const ok = await this.loadPrimaryCategories({ preserveSelection: true });
      if (ok) {
        this.showSuccessMessage('数据已更新');
      }
    } catch (error) {
      console.error('刷新数据失败:', error);
      this.showErrorMessage('刷新失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  async initCategoryScope(scope) {
    await this.refreshProfessionScope(true, scope);
  },

  consumePendingCategoryScope(scope) {
    if (scope === 'career' || scope === 'all') {
      return scope;
    }
    try {
      const pendingScope = wx.getStorageSync(CATEGORY_SCOPE_INTENT_KEY);
      if (pendingScope) {
        wx.removeStorageSync(CATEGORY_SCOPE_INTENT_KEY);
      }
      return pendingScope === 'career' || pendingScope === 'all' ? pendingScope : '';
    } catch (error) {
      return '';
    }
  },

  async refreshProfessionScope(isInit = false, scope) {
    const preferredScope = this.consumePendingCategoryScope(scope);
    const token = wx.getStorageSync('access_token');
    if (!token) {
      if (this.data.categoryScope !== 'all' || this.data.hasProfession || this.data.isLoggedIn) {
        this.setData({ categoryScope: 'all', isLoggedIn: false, hasProfession: false });
      }
      return;
    }

    try {
      const info = await fetchPersonalInfo();
      const hasProfession = hasProfessionSelected(info.professionCodes);
      const prevHasProfession = this.data.hasProfession;
      const patch = { isLoggedIn: true, hasProfession };

      if (!hasProfession) {
        // 未选职业只能看全部
        patch.categoryScope = 'all';
      } else if (preferredScope === 'career' || preferredScope === 'all') {
        // 显式意图（设置页跳转 / 登录回跳）优先
        patch.categoryScope = preferredScope;
      } else if (isInit || !prevHasProfession) {
        // 首次进入，或刚在个人中心选完职业回来 → 按默认设置切到「我的职业」
        const defaultScope = getLocalSettings().defaultQuestionScope;
        patch.categoryScope = defaultScope === 'all' ? 'all' : 'career';
      }
      // 其余情况保留用户当前手动切换的 Tab

      const scopeChanged =
        patch.categoryScope !== undefined && patch.categoryScope !== this.data.categoryScope;
      this.setData(patch);
      if (scopeChanged && !isInit) {
        await this.loadPrimaryCategories();
      }
    } catch (error) {
      console.warn('[category] 读取职业信息失败，默认展示全部分类', error);
      if (this.data.categoryScope !== 'all' || this.data.isLoggedIn || this.data.hasProfession) {
        this.setData({ categoryScope: 'all', isLoggedIn: false, hasProfession: false });
      }
    }
  },

  /**
   * 加载一级分类（categoryId = 0）
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
      console.log('[category] 加载一级分类 scope=', scope, 'url=', scope === 'career' ? '/repository/category/career' : '/repository/category');
      const response = await categoryApi.getCategories(categoryParams);
      console.log('一级分类：', response);

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
        currentPrimaryId
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
          secondaryLoadingMore: false
        });
        this._secondaryRows = [];
      }

      return true;
    } catch (error) {
      console.error('加载分类失败:', error);
      this.showErrorMessage(error?.message || '网络错误，请重试');
      this._secondaryRows = [];
      this.setData({
        primaryCategories: [],
        secondaryCategories: [],
        secondaryDisplayList: [],
        currentPrimaryId: null,
        categoryLoading: false,
        secondaryTotal: 0,
        secondaryHasMore: false,
        secondaryLoadingMore: false
      });
      return false;
    } finally {
      if (!preserveSelection) {
        this.setData({ loading: false });
      }
    }
  },

  /**
   * 根据当前一级分类加载二级分类。
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
        categoryLoading: true
      });
    } else {
      this.setData({ secondaryLoadingMore: true });
    }

    if (!parentId) {
      this.setData({
        categoryLoading: false,
        secondaryLoadingMore: false,
        secondaryHasMore: false
      });
      return;
    }

    try {
      const categoryParams = new CategoryParams(null, parentId, requestScope);
      categoryParams.sortField = 'sort_order';
      categoryParams.order = 'asc';
      categoryParams.page = nextPage;
      categoryParams.limit = this.data.secondaryPageSize;
      console.log('[category] 加载二级分类 parentId=', parentId, 'scope=', requestScope);
      const response = await categoryApi.getCategories(categoryParams);
      console.log('二级分类：', response);

      if (parentId != this.data.currentPrimaryId || requestScope !== this.data.categoryScope) {
        return;
      }

      const rawRows = response.data?.rows || [];
      const newChunk = decorateCategoryRows(rawRows);
      const rawTotal = response.data?.total;
      const parsedTotal = Number(rawTotal);
      const hasTotal =
        rawTotal !== undefined && rawTotal !== null && !Number.isNaN(parsedTotal);
      this._secondaryRows = refresh
        ? newChunk
        : [...this._secondaryRows, ...newChunk];
      const secondaryHasMore = hasTotal
        ? this._secondaryRows.length < parsedTotal
        : rawRows.length >= this.data.secondaryPageSize;

      this.setData({
        secondaryCategories: this._secondaryRows,
        secondaryPage: nextPage,
        secondaryTotal: hasTotal ? parsedTotal : this._secondaryRows.length,
        secondaryHasMore,
        categoryLoading: false,
        secondaryLoadingMore: false
      });
      this._rebuildSecondaryDisplay();
    } catch (error) {
      console.error('加载二级分类失败:', error);
      this.showErrorMessage(error?.message || '加载分类失败');
      const patch = {
        categoryLoading: false,
        secondaryLoadingMore: false
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

  async loadOpsSlots() {
    const [feedAds, topList] = await Promise.all([
      fetchBannersByPosition(POSITION_CATEGORY_FEED),
      fetchBannersByPosition(POSITION_CATEGORY_TOP)
    ]);
    this._categoryFeedAds = filterDismissedBanners(feedAds || []);
    const topBanner =
      !isBannerDismissedToday(POSITION_CATEGORY_TOP) && topList && topList.length
        ? topList[0]
        : null;
    this.setData({ topBanner });
    this._rebuildSecondaryDisplay();
  },

  _rebuildSecondaryDisplay() {
    const secondaryDisplayList = interleaveFeedItems(
      this._secondaryRows || [],
      this._categoryFeedAds || [],
      {
        every: 5,
        minBeforeFirst: 4,
        maxAds: 1,
        idPrefix: 'cat-ad'
      }
    );
    this.setData({ secondaryDisplayList });
  },

  onOpsBannerTap(e) {
    const item = (e.detail && e.detail.item) || null;
    openBannerLink(item);
  },

  onTopBannerDismiss() {
    dismissBannerToday(POSITION_CATEGORY_TOP);
    this.setData({ topBanner: null });
  },

  onFeedBannerDismiss(e) {
    const item = (e.detail && e.detail.item) || null;
    if (!item || item.id == null) return;
    dismissBannerItemToday(item.id);
    this._categoryFeedAds = filterDismissedBanners(this._categoryFeedAds || []);
    this._rebuildSecondaryDisplay();
  },

  loadMoreSecondaryCategories() {
    this.loadSecondaryCategories({ refresh: false });
  },

  calculateNavBarHeight() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();

    const navBarHeight =
      (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 +
      menuButtonInfo.height;

    const messageOffset = navBarHeight + 60;
    console.log('messageOffset:', messageOffset);
    this.setData({
      navBarHeight: navBarHeight,
      messageOffset: messageOffset
    });

    wx.setStorageSync('navBarHeight', navBarHeight + 'rpx');
    wx.setStorageSync('statusBarHeight', systemInfo.statusBarHeight + 'px');
  },

  showErrorMessage(content) {
    Message.error({
      content: content,
      offset: [this.data.messageOffset, 16],
      duration: 3000
    });
  },

  showSuccessMessage(content) {
    Message.success({
      content: content,
      offset: [this.data.messageOffset, 16],
      duration: 2000
    });
  },

  async switchPrimaryCategory(e) {
    const raw = e.currentTarget.dataset.id;
    const categoryId =
      typeof raw === 'number' ? raw : parseInt(String(raw), 10);
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
      categoryLoading: true
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
    const categoryId =
      typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isNaN(categoryId)) {
      return;
    }

    wx.navigateTo({
      url: `/pages/question/index?categoryId=${categoryId}&categoryName=${encodeURIComponent(name)}`
    });
  },

  async onScopeTap(e) {
    const scope = e.currentTarget.dataset.scope;
    if (!scope || scope === this.data.categoryScope) {
      return;
    }
    if (scope === 'career') {
      if (!wx.getStorageSync('access_token')) {
        try {
          wx.setStorageSync(CATEGORY_SCOPE_INTENT_KEY, 'career');
        } catch (error) {
          // ignore
        }
        app.navigateToLogin({ url: '/pages/category/index' });
        return;
      }
      if (!this.data.hasProfession) {
        wx.showModal({
          title: '尚未选择职业',
          content: '设置职业方向后，可查看更匹配的题库分类推荐。',
          confirmText: '去设置',
          cancelText: '先看全部',
          success: (res) => {
            if (res.confirm) {
              navigateToProfessionPage();
            }
          }
        });
        return;
      }
    }
    this.setData({
      categoryScope: scope,
      currentPrimaryId: null,
      secondaryCategories: [],
      secondaryDisplayList: [],
      secondaryPage: 1,
      secondaryTotal: 0,
      secondaryHasMore: true,
      secondaryLoadingMore: false
    });
    this._secondaryRows = [];
    await this.loadPrimaryCategories({ scope });
  },

  goRelease() {
    wx.navigateTo({
      url: '/pages/publish/index'
    });
  },

  onReleaseTap: function () {
    console.log('/pages/publish/index')
    app.navigateToLogin({
      url: `/pages/publish/index`,
      fail: function (res) {
        console.log('跳转失败', res);
      }
    });
  }
});
