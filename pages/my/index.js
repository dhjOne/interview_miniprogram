import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';
import { getQuestionBrowseHistoryCount } from '~/utils/questionBrowseHistory';
import {
  SOCIAL_STAT_ITEMS,
  fetchSocialSummary,
  formatStatCount
} from '~/utils/userSocial';

const app = getApp();
Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    historyCount: 0,
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
        icon: 'trend-chart',
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
    gridList: [
      {
        name: '全部发布',
        icon: 'root-list',
        type: 'all',
        url: '/pages/document/index?type=all'
      },
      {
        name: '审核中',
        icon: 'search',
        type: 'progress',
        url: '/pages/document/index?type=review'
      },
      {
        name: '已发布',
        icon: 'upload',
        type: 'published',
        url: '/pages/document/index?type=published'
      },
      {
        name: '草稿箱',
        icon: 'file-copy',
        type: 'draft',
        url: '/pages/document/index?type=drafts'
      }
    ],

    settingList: [
      {
        name: '设置',
        icon: 'setting',
        type: 'setting',
        url: '/pages/setting/index'
      }
    ]
  },

  async onShow() {
    const historyCount = getQuestionBrowseHistoryCount();
    this.setData({ historyCount });

    const Token = wx.getStorageSync('access_token');
    if (Token) {
      let personalInfo = app.getUserInfo();

      if (!personalInfo) {
        personalInfo = await this.getPersonalInfo();
      }
      this.setData({
        isLoad: true,
        personalInfo
      });
      this.loadSocialStats();
    } else {
      this.setData({
        isLoad: false,
        personalInfo: {},
        socialStats: this._buildSocialStatsDisplay(null)
      });
    }
  },

  _buildSocialStatsDisplay(summary) {
    const countKeyMap = {
      following: 'followingCount',
      followers: 'followerCount',
      visits: 'visitCount',
      ranking: 'myRank'
    };
    return SOCIAL_STAT_ITEMS.map((item) => {
      const key = item.countKey || countKeyMap[item.type];
      const count = summary && key ? Number(summary[key]) || 0 : 0;
      return {
        ...item,
        count,
        displayCount: formatStatCount(count)
      };
    });
  },

  async loadSocialStats() {
    const summary = await fetchSocialSummary();
    this.setData({
      socialStats: this._buildSocialStatsDisplay(summary)
    });
  },

  onSocialStatTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.url) return;
    app.navigateToLogin({ url: item.url });
  },

  async getPersonalInfo() {
    const info = await request('/genPersonalInfo').then((res) => res.data.data);
    return info;
  },

  onLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  onNavigateTo() {
    wx.navigateTo({ url: `/pages/my/info-edit/index` });
  },

  onEleClick(e) {
    const { url } = e.currentTarget.dataset.data;
    if (url) {
      app.navigateToLogin({
        url
      });
      return;
    }
    const { name } = e.currentTarget.dataset.data;
    this.onShowToast('#t-toast', name || '敬请期待');
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
