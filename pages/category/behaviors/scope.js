import { handleApiError } from '~/api/index';
import { fetchPersonalInfo } from '~/utils/userProfile';
import { hasProfessionSelected } from '~/utils/profession';
import { navigateToProfessionPage } from '~/utils/professionNav';
import { getLocalSettings } from '~/utils/userSettings';
import { CATEGORY_SCOPE_INTENT_KEY } from '~/utils/categoryDecorate';

const app = getApp();

/**
 * 题库 Tab：职业 scope（我的职业 / 全部）
 * 依赖页面：loadPrimaryCategories
 */
const categoryScopeBehavior = Behavior({
  data: {
    categoryScope: 'all',
    isLoggedIn: false,
    hasProfession: false,
    categoryScopeTabs: [
      { label: '我的职业', value: 'career' },
      { label: '全部', value: 'all' },
    ],
  },

  methods: {
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

    _readCachedUserInfo() {
      try {
        return (app.getUserInfo && app.getUserInfo()) || wx.getStorageSync('user_info') || {};
      } catch (e) {
        return {};
      }
    },

    /**
     * 根据职业信息计算 scope 补丁（不写网络）
     * @param {boolean} isInit
     * @param {string} preferredScope
     * @param {boolean} hasProfession
     * @param {boolean} isLoggedIn
     */
    buildScopePatch(isInit, preferredScope, hasProfession, isLoggedIn) {
      const patch = { isLoggedIn, hasProfession };
      const prevHasProfession = this.data.hasProfession;

      if (!hasProfession) {
        patch.categoryScope = 'all';
      } else if (preferredScope === 'career' || preferredScope === 'all') {
        patch.categoryScope = preferredScope;
      } else if (isInit || !prevHasProfession) {
        const defaultScope = getLocalSettings().defaultQuestionScope;
        patch.categoryScope = defaultScope === 'all' ? 'all' : 'career';
      }

      return patch;
    },

    /** 用本地 user_info 立刻定 scope，避免等 profile 才开始拉分类 */
    applyProfessionScopeFromCache(isInit = false, preferredScope = '') {
      const token = wx.getStorageSync('access_token');
      if (!token) {
        if (this.data.categoryScope !== 'all' || this.data.hasProfession || this.data.isLoggedIn) {
          this.setData({ categoryScope: 'all', isLoggedIn: false, hasProfession: false });
        }
        return;
      }

      const cached = this._readCachedUserInfo();
      const hasProfession = hasProfessionSelected(cached.professionCodes);
      this.setData(this.buildScopePatch(isInit, preferredScope, hasProfession, true));
    },

    /**
     * 拉取远端个人信息并校正 scope
     * @returns {Promise<boolean>} scope 是否相对进入前发生变化
     */
    async fetchAndApplyProfessionScope(isInit = false, preferredScope = '') {
      const token = wx.getStorageSync('access_token');
      if (!token) {
        if (this.data.categoryScope !== 'all' || this.data.hasProfession || this.data.isLoggedIn) {
          this.setData({ categoryScope: 'all', isLoggedIn: false, hasProfession: false });
        }
        return false;
      }

      const scopeBefore = this.data.categoryScope;
      try {
        const info = await fetchPersonalInfo();
        const hasProfession = hasProfessionSelected(info.professionCodes);
        const patch = this.buildScopePatch(isInit, preferredScope, hasProfession, true);
        this.setData(patch);
        return patch.categoryScope !== undefined && patch.categoryScope !== scopeBefore;
      } catch (error) {
        console.warn('[category] 读取职业信息失败，默认展示全部分类', error);
        handleApiError(error, { showToast: false, fallbackMessage: '读取职业信息失败' });
        if (this.data.categoryScope !== 'all' || this.data.isLoggedIn || this.data.hasProfession) {
          this.setData({ categoryScope: 'all', isLoggedIn: false, hasProfession: false });
        }
        return this.data.categoryScope !== scopeBefore;
      }
    },

    /**
     * 首屏：本地定 scope → 分类与远端 profile 并行；远端校正后必要时重拉分类
     */
    async bootstrapCategoryHome(scopeHint) {
      const preferredScope = this.consumePendingCategoryScope(scopeHint);
      this.applyProfessionScopeFromCache(true, preferredScope);
      const scopeUsed = this.data.categoryScope;

      const catsPromise = this.loadPrimaryCategories({ scope: scopeUsed });
      const scopeChangedPromise = this.fetchAndApplyProfessionScope(true, preferredScope);

      const [, scopeChanged] = await Promise.all([catsPromise, scopeChangedPromise]);
      if (scopeChanged && this.data.categoryScope !== scopeUsed) {
        await this.loadPrimaryCategories({ scope: this.data.categoryScope });
      }
    },

    /**
     * Tab 回切 / 下拉刷新：拉远端并在 scope 变化时重刷分类
     */
    async refreshProfessionScope(isInit = false, scope) {
      const preferredScope = this.consumePendingCategoryScope(scope);
      const scopeChanged = await this.fetchAndApplyProfessionScope(isInit, preferredScope);
      if (scopeChanged && !isInit) {
        await this.loadPrimaryCategories();
      }
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
            },
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
        secondaryLoadingMore: false,
      });
      this._secondaryRows = [];
      await this.loadPrimaryCategories({ scope });
    },
  },
});

export default categoryScopeBehavior;
