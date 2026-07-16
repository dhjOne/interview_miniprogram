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
import { socialApi } from '~/api/request/api_social';

const NOTIFY_URL = '/pages/ucenter/notifications/index';

const app = getApp();
Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    historyCount: 0,
    notifyUnread: 0,
    carousel: [
      { image: '/static/home/card0.png', title: '广告宣传' },
      { image: '/static/home/card1.png', title: '重点文献' },
      { image: '/static/home/card2.png', title: '新功能介绍' }
    ],
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
      },
      {
        name: '联系客服',
        icon: 'chat',
        type: 'contact'
      }
    ],
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
        this.loadNotificationPreview()
      ]);
    } else {
      this.setData({
        isLoad: false,
        personalInfo: {},
        socialStats: this._buildSocialStatsDisplay(null),
        creatorPreviewText: '登录后管理作品与数据',
        notifyUnread: 0
      });
    }
  },

  async loadNotificationPreview() {
    try {
      const res = await socialApi.getNotifications({ page: 1, limit: 20 });
      const data = res.data || {};
      const rows = data.rows || data.list || [];
      const apiUnread = data.unreadCount ?? data.unreadTotal ?? data.unread;
      const unreadFromList = rows.filter((item) => !item.isRead).length;
      const notifyUnread =
        apiUnread != null ? Math.max(0, Number(apiUnread) || 0) : unreadFromList;
      this.setData({ notifyUnread });
    } catch (e) {
      console.warn('[my] notification preview failed', e);
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
    wx.navigateTo({
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
    if (!item || item.type === 'contact' || !item.url) return;

    if (item.type === 'history') {
      wx.navigateTo({ url: item.url });
      return;
    }

    app.navigateToLogin({ url: item.url });
  },

  handleContact() {
    // 用户从客服会话返回时可选提示；此处保持静默以免打扰
  }
});
