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
          patch.categoryScope = 'all';
        } else if (preferredScope === 'career' || preferredScope === 'all') {
          patch.categoryScope = preferredScope;
        } else if (isInit || !prevHasProfession) {
          const defaultScope = getLocalSettings().defaultQuestionScope;
          patch.categoryScope = defaultScope === 'all' ? 'all' : 'career';
        }

        const scopeChanged =
          patch.categoryScope !== undefined && patch.categoryScope !== this.data.categoryScope;
        this.setData(patch);
        if (scopeChanged && !isInit) {
          await this.loadPrimaryCategories();
        }
      } catch (error) {
        console.warn('[category] 读取职业信息失败，默认展示全部分类', error);
        handleApiError(error, { showToast: false, fallbackMessage: '读取职业信息失败' });
        if (this.data.categoryScope !== 'all' || this.data.isLoggedIn || this.data.hasProfession) {
          this.setData({ categoryScope: 'all', isLoggedIn: false, hasProfession: false });
        }
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
