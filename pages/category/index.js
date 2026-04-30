import Message from 'tdesign-miniprogram/message';
import { authApi } from '~/api/request/api_category';
import { CategoryParams } from '~/api/param/param_category';
import { QuestionParams } from '~/api/param/param_category';

const app = getApp();

/** 与 TDesign 图标名一致；可按后端 type 字段扩展 */
const QUESTION_TYPE_ICON_MAP = {
  coding: 'code',
  code: 'code',
  algorithm: 'chart-bubble',
  network: 'wifi',
  database: 'server',
  system: 'system-sum',
  frontend: 'logo-miniprogram',
  backend: 'server',
  devops: 'layers',
  mobile: 'mobile',
  interview: 'chat',
  behavioral: 'user',
  theory: 'book'
};

const DEFAULT_LIST_ICON_COLOR = 'var(--td-brand-color)';

function normalizeDifficulty(d) {
  if (d === 'easy' || d === 'EASY' || Number(d) === 1) return 'easy';
  if (d === 'medium' || d === 'MEDIUM' || Number(d) === 2) return 'medium';
  if (d === 'hard' || d === 'HARD' || Number(d) === 3) return 'hard';
  return null;
}

/**
 * 列表左侧图标：icon 字段 > type / questionType 映射 > 难度 > 默认 file
 * @param {Record<string, any>} row
 * @returns {{ name: string, color: string }}
 */
function resolveQuestionListIcon(row) {
  const custom = (row.icon || '').toString().trim();
  if (custom && /^[a-z0-9-]+$/i.test(custom)) {
    return { name: custom, color: DEFAULT_LIST_ICON_COLOR };
  }
  const typeKey = (row.type || row.questionType || '')
    .toString()
    .trim()
    .toLowerCase();
  if (typeKey && QUESTION_TYPE_ICON_MAP[typeKey]) {
    return { name: QUESTION_TYPE_ICON_MAP[typeKey], color: DEFAULT_LIST_ICON_COLOR };
  }
  const diff = normalizeDifficulty(row.difficulty ?? row.difficultyLevel);
  if (diff === 'easy') {
    return { name: 'check-circle-filled', color: '#05945c' };
  }
  if (diff === 'medium') {
    return { name: 'chart-bubble', color: '#c65f16' };
  }
  if (diff === 'hard') {
    return { name: 'error-circle-filled', color: '#c9362e' };
  }
  return { name: 'file', color: DEFAULT_LIST_ICON_COLOR };
}

function decorateQuestionRows(rows) {
  return (rows || []).map((q) => {
    const { name, color } = resolveQuestionListIcon(q);
    return { ...q, listIconName: name, listIconColor: color };
  });
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
    scrollTop: 0,
    isScrolling: false
  },

  onLoad() {
    console.log('页面加载开始');
    this.calculateNavBarHeight();
    this.loadCategories();

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

      const categoryParams = new CategoryParams(null, 0);
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
        currentCategoryId
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
      currentCategoryId: categoryId
    });

    this.resetPagination();
    await this.loadQuestions();
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
    this.setData({
      scrollTop: e.detail.scrollTop
    });

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
