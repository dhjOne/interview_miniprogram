import { handleApiError } from '~/api/index';
import {
  fetchCreatorOverview,
  fetchRecentPublished,
  formatStatCount,
  getSelfUserId
} from '~/utils/creatorCenter';
import { openPage } from '~/utils/router';

const app = getApp();

const STATUS_ITEMS = [
  {
    type: 'all',
    name: '全部',
    icon: 'root-list',
    countKey: 'allCount',
    url: '/pages/document/index?type=all'
  },
  {
    type: 'published',
    name: '已发布',
    icon: 'upload',
    countKey: 'publishedCount',
    url: '/pages/document/index?type=published'
  },
  {
    type: 'progress',
    name: '审核中',
    icon: 'search',
    countKey: 'progressCount',
    url: '/pages/document/index?type=review'
  },
  {
    type: 'draft',
    name: '草稿箱',
    icon: 'file-copy',
    countKey: 'draftCount',
    url: '/pages/document/index?type=drafts'
  }
];

const TOOL_ITEMS = [
  {
    type: 'document',
    name: '内容管理',
    desc: '编辑与下架',
    icon: 'folder',
    url: '/pages/document/index?type=all'
  },
  {
    type: 'data',
    name: '数据洞察',
    desc: '阅读获赞与热门',
    icon: 'chart',
    url: '/pages/dataCenter/index'
  },
  {
    type: 'profile',
    name: '我的主页',
    desc: '作品对外展示',
    icon: 'user',
    url: ''
  },
  {
    type: 'points',
    name: '创作激励',
    desc: '积分与邀请',
    icon: 'wallet',
    url: '/pages/ucenter/points/index'
  }
];

Page({
  data: {
    loading: true,
    publishCount: 0,
    likeCount: 0,
    followerCount: 0,
    visitCount: 0,
    displayPublish: '0',
    displayLike: '0',
    displayFollower: '0',
    displayVisit: '0',
    hasWorks: false,
    statusItems: STATUS_ITEMS.map((item) => ({
      ...item,
      displayCount: ''
    })),
    toolItems: TOOL_ITEMS,
    recentList: [],
    overviewStats: [
      { type: 'works', label: '作品', display: '0', url: '/pages/document/index?type=published' },
      { type: 'likes', label: '获赞', display: '0', url: '' },
      { type: 'followers', label: '粉丝', display: '0', url: '/pages/ucenter/followers/index' },
      { type: 'visits', label: '访问', display: '0', url: '/pages/ucenter/visits/index' }
    ]
  },

  onShow() {
    return this.refreshCreatorCenter();
  },

  onPullDownRefresh() {
    return this.refreshCreatorCenter().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async refreshCreatorCenter() {
    this.setData({ loading: true });
    try {
      const [overview, recentList] = await Promise.all([
        fetchCreatorOverview(),
        fetchRecentPublished(3)
      ]);

      const statusItems = STATUS_ITEMS.map((item) => {
        const raw = overview[item.countKey];
        return {
          ...item,
          displayCount: raw == null ? '' : formatStatCount(raw)
        };
      });

      const hasWorks =
        Number(overview.publishCount) > 0 ||
        Number(overview.publishedCount) > 0 ||
        recentList.length > 0;

      this.setData({
        loading: false,
        publishCount: overview.publishCount,
        likeCount: overview.likeCount,
        followerCount: overview.followerCount,
        visitCount: overview.visitCount,
        displayPublish: overview.displayPublish,
        displayLike: overview.displayLike,
        displayFollower: overview.displayFollower,
        displayVisit: overview.displayVisit,
        hasWorks,
        statusItems,
        recentList,
        overviewStats: [
          {
            type: 'works',
            label: '作品',
            display: overview.displayPublish,
            url: '/pages/document/index?type=published'
          },
          {
            type: 'likes',
            label: '获赞',
            display: overview.displayLike,
            url: ''
          },
          {
            type: 'followers',
            label: '粉丝',
            display: overview.displayFollower,
            url: '/pages/ucenter/followers/index'
          },
          {
            type: 'visits',
            label: '访问',
            display: overview.displayVisit,
            url: '/pages/ucenter/visits/index'
          }
        ]
      });
    } catch (e) {
      console.error('[creator] refresh failed', e);
      this.setData({ loading: false });
      handleApiError(e, { fallbackMessage: '加载失败' });
    }
  },

  onWriteTap() {
    app.navigateToLogin({ url: '/pages/publish/index' });
  },

  onOverviewStatTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.url) return;
    app.navigateToLogin({ url: item.url });
  },

  onStatusTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.url) return;
    app.navigateToLogin({ url: item.url });
  },

  onToolTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    if (item.type === 'profile') {
      const userId = getSelfUserId();
      if (!userId) {
        app.navigateToLogin({ url: '/pages/login/login' });
        return;
      }
      const info = app.getUserInfo?.() || wx.getStorageSync('user_info') || {};
      const nickname = encodeURIComponent(info.nickname || '');
      const avatar = encodeURIComponent(info.avatar || '');
      app.navigateToLogin({
        url: `/pages/ucenter/profile/index?userId=${userId}&nickname=${nickname}&avatar=${avatar}`
      });
      return;
    }

    if (item.url) {
      app.navigateToLogin({ url: item.url });
    }
  },

  onRecentTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    openPage({ url: `/pages/question/detail/index?id=${id}` });
  },

  onViewAllTap() {
    app.navigateToLogin({ url: '/pages/document/index?type=published' });
  }
});
