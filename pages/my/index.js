import useToastBehavior from '~/behaviors/useToast';
import { getQuestionBrowseHistoryCount } from '~/utils/questionBrowseHistory';
import {
  SOCIAL_STAT_ITEMS,
  fetchSocialSummary,
  formatStatCount
} from '~/utils/userSocial';
import { fetchPointAccount } from '~/utils/points';
import { fetchPersonalInfo, syncCachedUserInfo } from '~/utils/userProfile';
import { fetchCreatorPreview } from '~/utils/creatorCenter';
import { socialApi } from '~/api/index';
import { fetchSiteInfo, getDefaultSiteInfo, isCallablePhone } from '~/utils/site';
import {
  bannerNeedsLogin,
  fetchBannersByPosition,
  getDefaultMyCarousel,
  POSITION_MY_CAROUSEL
} from '~/utils/banners';
import { openPage } from '~/utils/router';

const NOTIFY_URL = '/pages/ucenter/notifications/index';

const app = getApp();
Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    historyCount: 0,
    notifyUnread: 0,
    carousel: getDefaultMyCarousel(),
    /** 高频学习入口：保持一行三格 */
    service: [
      {
        name: '浏览历史',
        icon: 'browse',
        type: 'history',
        url: '/pages/ucenter/history/index'
      },
      {
        name: '收藏夹',
        icon: 'heart',
        type: 'favorite',
        url: '/pages/ucenter/favorite/index'
      },
      {
        name: '刷题排行',
        icon: 'leaderboard',
        type: 'ranking',
        url: '/pages/ucenter/ranking/index'
      }
    ],
    /** 低频支撑入口：独立模块，避免挤占常用区 */
    moreServices: [
      {
        name: '商务合作',
        desc: '品牌投放 · 机构共建',
        icon: 'shop',
        type: 'business',
        url: '/pages/ucenter/business/index'
      },
      {
        name: '联系客服',
        desc: '使用咨询 · 问题反馈',
        icon: 'service',
        type: 'contact'
      }
    ],
    siteInfo: getDefaultSiteInfo(),
    personalInfo: {},
    socialStats: SOCIAL_STAT_ITEMS.map((item) => ({
      ...item,
      count: 0,
      displayCount: '0'
    })),
    /** 创作中心核心模块：四宫格直达，减少一层跳转 */
    creatorGridList: [
      {
        name: '去创作',
        icon: 'edit-1',
        type: 'write',
        url: '/pages/publish/index'
      },
      {
        name: '内容管理',
        icon: 'folder',
        type: 'document',
        url: '/pages/document/index?type=all'
      },
      {
        name: '数据洞察',
        icon: 'chart',
        type: 'data',
        url: '/pages/dataCenter/index'
      },
      {
        name: '创作激励',
        icon: 'wallet',
        type: 'points',
        url: '/pages/ucenter/points/index'
      }
    ],
    creatorPreviewText: '作品 0 · 获赞 0'
  },

  onLoad() {
    this._onPointsChanged = () => {
      if (wx.getStorageSync('access_token')) {
        this.loadSocialStats();
      }
    };
    app.on('points-changed', this._onPointsChanged);
  },

  onUnload() {
    if (this._onPointsChanged) {
      app.off('points-changed', this._onPointsChanged);
    }
  },

  async onShow() {
    return this.refreshPersonalCenter();
  },

  async onPullDownRefresh() {
    return this.refreshPersonalCenter();
  },

  async refreshPersonalCenter() {
    const historyCount = getQuestionBrowseHistoryCount();
    this.setData({ historyCount });

    // 站点页脚、运营位不依赖登录，与个人中心并行拉取
    const publicPromise = Promise.all([this.loadSiteInfo(), this.loadCarousel()]);

    const Token = wx.getStorageSync('access_token');
    if (Token) {
      try {
        const personalInfo = await this.getPersonalInfo();
        this.setData({
          isLoad: true,
          personalInfo
        });
      } catch (e) {
        const cached = app.getUserInfo() || {};
        this.setData({
          isLoad: true,
          personalInfo: cached
        });
      }
      await Promise.all([
        this.loadSocialStats(),
        this.loadCreatorPreview(),
        this.loadNotificationPreview(),
        publicPromise
      ]);
    } else {
      this.setData({
        isLoad: false,
        personalInfo: {},
        socialStats: this._buildSocialStatsDisplay(null),
        creatorPreviewText: '登录后管理作品与数据',
        notifyUnread: 0
      });
      await publicPromise;
    }
  },

  async loadSiteInfo() {
    try {
      const siteInfo = await fetchSiteInfo();
      this.setData({ siteInfo });
    } catch (e) {
      console.warn('[my] site info failed', e);
    }
  },

  async loadCarousel() {
    try {
      const carousel = await fetchBannersByPosition(POSITION_MY_CAROUSEL);
      this.setData({ carousel });
    } catch (e) {
      console.warn('[my] carousel failed', e);
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
        Number(data.unreadCount ?? data.unreadTotal ?? data.unread ?? 0) || 0
      );
      this.setData({ notifyUnread });
    } catch (e) {
      console.warn('[my] notification unread failed', e);
      this.setData({ notifyUnread: 0 });
    }
  },

  onNotifyTap() {
    app.navigateToLogin({ url: NOTIFY_URL });
  },

  _buildCreatorPreviewText(preview) {
    const parts = [
      `作品 ${formatStatCount(preview.publishCount || 0)}`,
      `获赞 ${formatStatCount(preview.likeCount || 0)}`
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
        creatorPreviewText: this._buildCreatorPreviewText(preview)
      });
    } catch (e) {
      console.warn('[my] creator preview failed', e);
      this.setData({
        creatorPreviewText: '管理作品 · 查看数据 · 继续创作'
      });
    }
  },

  _buildSocialStatsDisplay(summary) {
    const countKeyMap = {
      following: 'followingCount',
      followers: 'followerCount',
      visits: 'visitCount',
      points: 'availablePoints'
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
        displayCount: formatStatCount(count)
      };
    });
  },

  async loadSocialStats() {
    const [summary, account] = await Promise.all([
      fetchSocialSummary(),
      fetchPointAccount().catch(() => null)
    ]);
    const merged = {
      ...(summary || {}),
      ...(account ? { availablePoints: account.availablePoints } : {})
    };
    this.setData({
      socialStats: this._buildSocialStatsDisplay(merged)
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
      url: '/pages/login/login'
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

  /** 常用服务：浏览历史免登录；收藏与排行需登录 */
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
      success: () => wx.showToast({ title: '已复制邮箱', icon: 'success' })
    });
  },

  onOpenAgreement() {
    openPage({ url: '/pages/agreement/agreement?from=my' });
  },

  handleContact() {
    // 用户从客服会话返回时可选提示；此处保持静默以免打扰
  }
});
