import Message from 'tdesign-miniprogram/message';
import { authApi } from '~/api/request/api_category';
import { CategoryParams } from '~/api/param/param_category';
import { QuestionParams } from '~/api/param/param_category';
import { fetchPersonalInfo } from '~/utils/userProfile';
import { hasProfessionSelected } from '~/utils/profession';
import { navigateToProfessionPage } from '~/utils/professionNav';

const app = getApp();

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

/** 按题目 id 稳定分配随机图标（同题刷新不变） */
function resolveQuestionListIcon(row) {
  const seed = hashSeed(row.id ?? row.name ?? 0);
  return {
    name: LIST_ICON_NAMES[seed % LIST_ICON_NAMES.length],
    color: LIST_ICON_COLORS[seed % LIST_ICON_COLORS.length],
    bg: LIST_ICON_BGS[seed % LIST_ICON_BGS.length]
  };
}

function decorateQuestionRows(rows) {
  return (rows || []).map((q) => {
    const { name, color, bg } = resolveQuestionListIcon(q);
    return { ...q, listIconName: name, listIconColor: color, listIconBg: bg };
  });
}

function pickCategoryMeta(categories, categoryId) {
  const row = (categories || []).find((c) => c.id == categoryId);
  return {
    currentCategoryName: row?.name || '',
    currentCategoryCount: row?.count || 0
  };
}

Page({
  data: {
    categories: [],
    currentCategoryId: null,
    currentQuestions: [],
    navBarHeight: 90,
    enable: false,
    loading: false,
    lastRefreshTime: 0,
    needRefresh: false,
    messageOffset: 100,

    page: 1,
    pageSize: 10,
    hasMore: true,
    isLoadingMore: false,
    total: 0,
    isScrolling: false,
    currentCategoryName: '',
    currentCategoryCount: 0,
    categoryLoading: false,
    categoryScope: 'all',
    hasProfession: false,
    categoryScopeTabs: [
      { label: '我的职业', value: 'career' },
      { label: '全部', value: 'all' }
    ]
  },

  onLoad() {
    console.log('页面加载开始');
    this.calculateNavBarHeight();
    this.initCategoryScope().finally(() => this.loadCategories());

    app.on('refreshQuestionBank', this.handleRefresh.bind(this));
  },

  onUnload() {
    app.off('refreshQuestionBank', this.handleRefresh);
  },

  handleRefresh() {
    console.log('收到刷新指令');
    this.setData({ needRefresh: true });

    if (this.data.currentCategoryId) {
      this.refreshCurrentData();
    }
  },

  onShow() {
    console.log('页面显示');
    this.refreshProfessionScope(false);
    const now = Date.now();
    const shouldRefresh =
      this.data.needRefresh ||
      now - this.data.lastRefreshTime > 5 * 60 * 1000 ||
      !this.data.categories.length;

    if (shouldRefresh && this.data.currentCategoryId) {
      this.refreshCurrentData();
      this.setData({ needRefresh: false });
    }
  },

  onHide() {
    console.log('页面隐藏');
    this.setData({
      lastRefreshTime: Date.now()
    });
  },

  async refreshCurrentData() {
    console.log('刷新当前页面数据');

    try {
      this.setData({ loading: true });
      const ok = await this.loadCategories({ preserveSelection: true });
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

  async initCategoryScope() {
    await this.refreshProfessionScope(true);
  },

  async refreshProfessionScope(isInit = false) {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      if (this.data.categoryScope !== 'all' || this.data.hasProfession) {
        this.setData({ categoryScope: 'all', hasProfession: false });
      }
      return;
    }

    try {
      const info = await fetchPersonalInfo();
      const hasProfession = hasProfessionSelected(info.professionCodes);
      const patch = { hasProfession };
      if (!hasProfession) {
        patch.categoryScope = 'all';
      } else if (isInit && this.data.categoryScope === 'all') {
        patch.categoryScope = 'career';
      }
      const scopeChanged = patch.categoryScope !== undefined && patch.categoryScope !== this.data.categoryScope;
      this.setData(patch);
      if (scopeChanged && !isInit) {
        await this.loadCategories();
      }
    } catch (error) {
      console.warn('[category] 读取职业信息失败，默认展示全部分类', error);
      if (this.data.categoryScope !== 'all') {
        this.setData({ categoryScope: 'all', hasProfession: false });
      }
    }
  },

  resetPagination() {
    this.setData({
      page: 1,
      hasMore: true,
      isLoadingMore: false,
      total: 0,
      currentQuestions: []
    });
  },

  /**
   * 加载单层分类（parentId = 0）
   * @param {{ preserveSelection?: boolean }} [opts]
   * @returns {Promise<boolean>}
   */
  async loadCategories(opts = {}) {
    const preserveSelection = !!opts.preserveSelection;

    try {
      if (!preserveSelection) {
        this.setData({ loading: true });
      }

      const categoryParams = new CategoryParams(null, 0, this.data.categoryScope);
      categoryParams.sortField = 'sort_order';
      categoryParams.order = 'asc';
      const response = await authApi.getCategories(categoryParams);
      console.log('分类列表：', response);

      const categories = response.data?.rows || [];
      let currentCategoryId = this.data.currentCategoryId;

      if (preserveSelection && currentCategoryId != null) {
        const stillExists = categories.some((c) => c.id == currentCategoryId);
        if (!stillExists) {
          currentCategoryId = categories[0]?.id ?? null;
        }
      } else {
        currentCategoryId = categories[0]?.id ?? null;
      }

      this.setData({
        categories,
        currentCategoryId,
        ...pickCategoryMeta(categories, currentCategoryId)
      });

      this.resetPagination();

      if (currentCategoryId) {
        await this.loadQuestions();
      } else {
        this.setData({
          currentQuestions: [],
          total: 0,
          hasMore: false
        });
      }

      return true;
    } catch (error) {
      console.error('加载分类失败:', error);
      this.showErrorMessage('网络错误，请重试');
      this.setData({
        categories: [],
        currentCategoryId: null,
        currentQuestions: [],
        total: 0,
        hasMore: false
      });
      return false;
    } finally {
      if (!preserveSelection) {
        this.setData({ loading: false });
      }
    }
  },

  async loadQuestions() {
    if (!this.data.currentCategoryId) {
      this.setData({ currentQuestions: [] });
      return;
    }

    if (!this.data.hasMore && this.data.page > 1) {
      return;
    }

    try {
      const questionParams = new QuestionParams(
        null,
        this.data.currentCategoryId,
        null
      );
      questionParams.sortField = 'id';
      questionParams.order = 'asc';
      questionParams.page = this.data.page;
      questionParams.limit = this.data.pageSize;

      const response = await authApi.getQuestions(questionParams);
      console.log('问题列表：', response);

      if (response.code === '0000' && response.data) {
        const rawRows = response.data.rows || [];
        const newChunk = decorateQuestionRows(rawRows);
        const total = response.data.total || 0;

        const currentQuestions =
          this.data.page === 1
            ? newChunk
            : [...this.data.currentQuestions, ...newChunk];

        const hasMore = currentQuestions.length < total;

        this.setData({
          currentQuestions,
          total,
          hasMore,
          isLoadingMore: false
        });

        console.log(
          `第${this.data.page}页加载完成，共${currentQuestions.length}条，总计${total}条，还有更多: ${hasMore}`
        );
      } else {
        this.setData({
          isLoadingMore: false
        });
      }
    } catch (error) {
      console.error('加载问题失败:', error);
      this.showErrorMessage('加载内容失败');
      this.setData({
        isLoadingMore: false
      });
    }
  },

  async loadMoreQuestions() {
    if (this.data.isLoadingMore || !this.data.hasMore) {
      return;
    }

    this.setData({
      isLoadingMore: true
    });

    const nextPage = this.data.page + 1;

    this.setData({
      page: nextPage
    });

    await this.loadQuestions();
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

  async switchCategory(e) {
    const raw = e.currentTarget.dataset.id;
    const categoryId =
      typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isNaN(categoryId) || categoryId == this.data.currentCategoryId) {
      return;
    }

    this.setData({
      currentCategoryId: categoryId,
      categoryLoading: true,
      page: 1,
      hasMore: true,
      isLoadingMore: false,
      total: 0,
      ...pickCategoryMeta(this.data.categories, categoryId)
    });

    try {
      await this.loadQuestions();
    } finally {
      this.setData({ categoryLoading: false });
    }
  },

  async onScopeTap(e) {
    const scope = e.currentTarget.dataset.scope;
    if (!scope || scope === this.data.categoryScope) {
      return;
    }
    if (scope === 'career' && !this.data.hasProfession) {
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
    this.setData({
      categoryScope: scope,
      currentCategoryId: null,
      currentQuestions: []
    });
    await this.loadCategories();
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    const images = this.data.currentQuestions.map((item) => item.url);

    wx.previewImage({
      urls: images,
      current: url
    });
  },

  async onRefresh() {
    try {
      this.resetPagination();
      await this.loadQuestions();
      this.showSuccessMessage('刷新成功');
    } catch (error) {
      this.showErrorMessage('刷新失败');
    } finally {
      this.setData({ enable: false });
    }
  },

  onPageScroll(e) {
    if (this.data.isScrolling) return;

    this.setData({
      isScrolling: true
    });

    setTimeout(() => {
      this.setData({
        isScrolling: false
      });
    }, 300);
  },

  onReachBottom() {
    console.log('滚动到底部，触发加载更多');
    this.loadMoreQuestions();
  },

  goRelease() {
    wx.navigateTo({
      url: '/pages/release/release'
    });
  },

  onQuestionClick(e) {
    const qid = e.currentTarget.dataset.id;
    const row = this.data.currentQuestions.find((item) => item.id == qid);
    if (!row) {
      return;
    }

    console.log('点击问题:', row);

    wx.navigateTo({
      url: `/pages/question/index?categoryId=${qid}&categoryName=${row.name}`
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
  },

  onScrollToLower() {
    console.log('滚动到底部');
    this.loadMoreQuestions();
  }
});
