import useToastBehavior from '~/behaviors/useToast';
import { getQuestionBrowseHistoryCount } from '~/utils/questionBrowseHistory';
import { SOCIAL_STAT_ITEMS, fetchSocialSummary, formatStatCount } from '~/utils/userSocial';
import { fetchPointAccount } from '~/utils/points';
import { fetchPersonalInfo, syncCachedUserInfo } from '~/utils/userProfile';
import { fetchCreatorPreview } from '~/utils/creatorCenter';
import { socialApi, handleApiError, mobileAdminApi } from '~/api/index';
import { fetchSiteInfo, getDefaultSiteInfo, isCallablePhone } from '~/utils/site';
import {
  bannerNeedsLogin,
  fetchBannersByPosition,
  getDefaultMyCarousel,
  POSITION_MY_CAROUSEL,
} from '~/utils/banners';
import { openPage } from '~/utils/router';
import { AppEvents } from '~/utils/eventBus';

const NOTIFY_URL = '/pages/ucenter/notifications/index';
/** 「我的」Tab 短缓存：切回来 60s 内不重复打接口（下拉刷新强制） */
const MY_REFRESH_TTL_MS = 60 * 1000;

const app = getApp();
Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    refreshing: false,
    historyCount: 0,
    notifyUnread: 0,
    carousel: getDefaultMyCarousel(),
    /** 高频学习入口：保持一行三格；速记已提升为底部 Tab */
    service: [
      {
        name: '浏览历史',
        icon: 'browse',
        type: 'history',
        url: '/pages/ucenter/history/index',
      },
      {
        name: '收藏夹',
        icon: 'heart',
        type: 'favorite',
        url: '/pages/ucenter/favorite/index',
      },
      {
        name: '刷题排行',
        icon: 'leaderboard',
        type: 'ranking',
        url: '/pages/ucenter/ranking/index',
      },
    ],
    /** 低频支撑入口：独立模块，避免挤占常用区 */
    moreServices: [
      {
        name: '商务合作',
        desc: '品牌投放 · 机构共建',
        icon: 'shop',
        type: 'business',
        url: '/pages/ucenter/business/index',
      },
      {
        name: '联系客服',
        desc: '使用咨询 · 问题反馈',
        icon: 'service',
        type: 'contact',
      },
    ],
    siteInfo: getDefaultSiteInfo(),
    personalInfo: {},
    mobileAdminVisible: false,
    mobileAdminPendingCount: 0,
    mobileAdminModuleText: '内容与资料审批',
    socialStats: SOCIAL_STAT_ITEMS.map((item) => ({
      ...item,
      count: 0,
      displayCount: '0',
    })),
    /** 创作中心核心模块：四宫格直达，减少一层跳转 */
    creatorGridList: [
      {
        name: '去创作',
        icon: 'edit-1',
        type: 'write',
        url: '/pages/publish/index',
      },
      {
        name: '内容管理',
        icon: 'folder',
        type: 'document',
        url: '/pages/document/index?type=all',
      },
      {
        name: '数据洞察',
        icon: 'chart',
        type: 'data',
        url: '/pages/dataCenter/index',
      },
      {
        name: '创作激励',
        icon: 'wallet',
        type: 'points',
        url: '/pages/ucenter/points/index',
      },
    ],
    creatorPreviewText: '作品 0 · 获赞 0',
  },

  onLoad() {
    this._lastRefreshAt = 0;
    this._lastRefreshToken = '';
    this._onPointsChanged = () => {
      this._lastRefreshAt = 0;
      if (wx.getStorageSync('access_token')) {
        this.loadSocialStats();
      }
    };
    app.eventBus.on(AppEvents.POINTS_CHANGED, this._onPointsChanged);
  },

  onUnload() {
    if (this._onPointsChanged) {
      app.eventBus.off(AppEvents.POINTS_CHANGED, this._onPointsChanged);
    }
  },

  async onShow() {
    return this.refreshPersonalCenter(false);
  },

  async onScrollRefresh() {
    this.setData({ refreshing: true });
    try {
      await this.refreshPersonalCenter(true);
    } finally {
      this.setData({ refreshing: false });
    }
  },

  async refreshPersonalCenter(force = false) {
    const historyCount = getQuestionBrowseHistoryCount();
    this.setData({ historyCount });

    const Token = wx.getStorageSync('access_token') || '';
    const now = Date.now();
    if (
      !force &&
      this._lastRefreshAt &&
      now - this._lastRefreshAt < MY_REFRESH_TTL_MS &&
      this._lastRefreshToken === Token
    ) {
      return;
    }

    // 站点页脚、运营位不依赖登录，与个人中心并行拉取
    const publicPromise = Promise.all([this.loadSiteInfo(), this.loadCarousel()]);

    if (Token) {
      const cached = app.getUserInfo() || {};
      if (cached && Object.keys(cached).length) {
        this.setData({ isLoad: true, personalInfo: cached });
      }

      await Promise.all([
        this.getPersonalInfo()
          .then((personalInfo) => {
            this.setData({ isLoad: true, personalInfo });
          })
          .catch((e) => {
            if (!cached || !Object.keys(cached).length) {
              this.setData({ isLoad: true, personalInfo: {} });
            }
            handleApiError(e, {
              showToast: !cached || !Object.keys(cached).length,
              fallbackMessage: '加载个人信息失败',
            });
          }),
        this.loadSocialStats(),
        this.loadCreatorPreview(),
        this.loadNotificationPreview(),
        this.loadMobileAdminOverview(),
        publicPromise,
      ]);
    } else {
      this.setData({
        isLoad: false,
        personalInfo: {},
        socialStats: this._buildSocialStatsDisplay(null),
        creatorPreviewText: '登录后管理作品与数据',
        notifyUnread: 0,
        mobileAdminVisible: false,
        mobileAdminPendingCount: 0,
      });
      await publicPromise;
    }

    this._lastRefreshAt = Date.now();
    this._lastRefreshToken = Token;
  },

  async loadSiteInfo() {
    try {
      const siteInfo = await fetchSiteInfo();
      this.setData({ siteInfo });
    } catch (e) {
      console.warn('[my] site info failed', e);
      handleApiError(e, { showToast: false, fallbackMessage: '站点信息加载失败' });
    }
  },

  async loadCarousel() {
    try {
      const carousel = await fetchBannersByPosition(POSITION_MY_CAROUSEL);
      this.setData({ carousel });
    } catch (e) {
      console.warn('[my] carousel failed', e);
      handleApiError(e, { showToast: false, fallbackMessage: '轮播加载失败' });
      this.setData({ carousel: getDefaultMyCarousel() });
    }
  },

  onCarouselTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || item.linkType !== 'PAGE' || !item.linkUrl) return;
    if (bannerNeedsLogin(item.linkUrl)) {
      app.navigateToLogin({ url: item.linkUrl });
      return;
    }
    openPage({ url: item.linkUrl });
  },

  async loadNotificationPreview() {
    try {
      const res = await socialApi.getNotificationUnreadCount();
      const data = res.data || {};
      const notifyUnread = Math.max(
        0,
        Number(data.unreadCount ?? data.unreadTotal ?? data.unread ?? 0) || 0,
      );
      this.setData({ notifyUnread });
    } catch (e) {
      console.warn('[my] notification unread failed', e);
      handleApiError(e, { showToast: false, fallbackMessage: '未读消息加载失败' });
      this.setData({ notifyUnread: 0 });
    }
  },

  async loadMobileAdminOverview() {
    try {
      const res = await mobileAdminApi.getOverview();
      const overview = res.data || {};
      if (!overview.hasAccess) {
        this.setData({ mobileAdminVisible: false, mobileAdminPendingCount: 0 });
        return;
      }
      const modules = ['questions', 'profiles', 'categories']
        .map((key) => ({ key, ...(overview[key] || {}) }))
        .filter((item) => item.visible);
      const pendingCount = modules.reduce((sum, item) => sum + (Number(item.pendingCount) || 0), 0);
      const moduleNameMap = {
        questions: '内容审核',
        profiles: '资料审核',
        categories: '分类建议',
      };
      const moduleText = modules.map((item) => moduleNameMap[item.key]).filter(Boolean).join(' · ');
      this.setData({
        mobileAdminVisible: true,
        mobileAdminPendingCount: pendingCount,
        mobileAdminModuleText: moduleText || '移动管理台',
      });
    } catch (e) {
      console.warn('[my] mobile admin overview failed', e);
      this.setData({ mobileAdminVisible: false, mobileAdminPendingCount: 0 });
      handleApiError(e, { showToast: false, fallbackMessage: '移动管理台权限加载失败' });
    }
  },

  onNotifyTap() {
    app.navigateToLogin({ url: NOTIFY_URL });
  },

  _buildCreatorPreviewText(preview) {
    const parts = [
      `作品 ${formatStatCount(preview.publishCount || 0)}`,
      `获赞 ${formatStatCount(preview.likeCount || 0)}`,
    ];
    if (preview.draftCount != null) {
      parts.push(`草稿 ${formatStatCount(preview.draftCount)}`);
    }
    return parts.join(' · ');
  },

  async loadCreatorPreview() {
    try {
      const preview = await fetchCreatorPreview();
      this.setData({
        creatorPreviewText: this._buildCreatorPreviewText(preview),
      });
    } catch (e) {
      console.warn('[my] creator preview failed', e);
      handleApiError(e, { showToast: false, fallbackMessage: '创作预览加载失败' });
      this.setData({
        creatorPreviewText: '管理作品 · 查看数据 · 继续创作',
      });
    }
  },

  _buildSocialStatsDisplay(summary) {
    const countKeyMap = {
      following: 'followingCount',
      followers: 'followerCount',
      visits: 'visitCount',
      points: 'availablePoints',
    };
    return SOCIAL_STAT_ITEMS.map((item) => {
      const key = item.countKey || countKeyMap[item.type];
      let count = summary && key ? Number(summary[key]) || 0 : 0;
      if (item.type === 'points' && summary && summary.availablePoints != null) {
        count = Number(summary.availablePoints) || 0;
      }
      return {
        ...item,
        count,
        displayCount: formatStatCount(count),
      };
    });
  },

  async loadSocialStats() {
    const [summary, account] = await Promise.all([
      fetchSocialSummary().catch((e) => {
        handleApiError(e, { showToast: false, fallbackMessage: '社交统计加载失败' });
        return null;
      }),
      fetchPointAccount().catch((e) => {
        handleApiError(e, { showToast: false, fallbackMessage: '积分账户加载失败' });
        return null;
      }),
    ]);
    const merged = {
      ...(summary || {}),
      ...(account ? { availablePoints: account.availablePoints } : {}),
    };
    this.setData({
      socialStats: this._buildSocialStatsDisplay(merged),
    });
  },

  onSocialStatTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.url) return;
    app.navigateToLogin({ url: item.url });
  },

  async getPersonalInfo() {
    const info = await fetchPersonalInfo();
    syncCachedUserInfo(info);
    return info;
  },

  onLogin() {
    openPage({
      url: '/pages/login/login',
    });
  },

  onSettingTap() {
    app.navigateToLogin({ url: '/pages/setting/index' });
  },

  onCreatorCenterTap() {
    app.navigateToLogin({ url: '/pages/creator/index' });
  },

  onCreatorGridTap(e) {
    const item = e.currentTarget.dataset.data;
    if (!item) return;

    if (item.url) {
      app.navigateToLogin({ url: item.url });
      return;
    }

    this.onShowToast('#t-toast', item.name || '敬请期待');
  },

  onMobileAdminTap() {
    app.navigateToLogin({ url: '/pages/mobileAdmin/index' });
  },

  /** 常用服务：浏览历史免登录；其他个人数据需登录 */
  onServiceItemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.url) return;

    if (item.type === 'history') {
      openPage({ url: item.url });
      return;
    }

    app.navigateToLogin({ url: item.url });
  },

  onMoreServiceTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || item.type === 'contact') return;
    if (item.type === 'business' && item.url) {
      openPage({ url: item.url });
    }
  },

  onCallPhone() {
    const phone = (this.data.siteInfo && this.data.siteInfo.phone) || '';
    if (!isCallablePhone(phone)) {
      wx.showToast({ title: '电话暂未配置', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: String(phone).replace(/[^\d+]/g, '') });
  },

  onCopyEmail() {
    const email = (this.data.siteInfo && this.data.siteInfo.email) || '';
    if (!email) return;
    wx.setClipboardData({
      data: email,
      success: () => wx.showToast({ title: '已复制邮箱', icon: 'success' }),
    });
  },

  onOpenAgreement() {
    openPage({ url: '/pages/agreement/agreement?from=my' });
  },

  handleContact() {
    // 用户从客服会话返回时可选提示；此处保持静默以免打扰
  },
});
