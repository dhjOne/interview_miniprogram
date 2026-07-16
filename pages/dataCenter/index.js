import { fetchCreatorInsights } from '~/utils/creatorInsights';

Page({
  data: {
    loading: true,
    loadError: false,
    topSort: 'view',
    trendMetric: 'like',
    trendRange: '7d',
    overview: {
      displayViews: '0',
      displayLikes: '0',
      displayCollects: '0',
      displayComments: '0',
      displayPublish: '0',
      displayFeatured: '0',
      displayFollowers: '0',
      displayVisits: '0',
      displayRank: '—',
      draftCount: 0,
      progressCount: 0,
      publishCount: 0,
      offlineCount: 0
    },
    coreMetrics: [],
    growthMetrics: [],
    statusItems: [],
    topList: [],
    trendList: [],
    trendMax: 1,
    updatedText: ''
  },

  onLoad() {
    this.refresh();
  },

  onPullDownRefresh() {
    return this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    this.setData({ loading: true, loadError: false });
    try {
      const { overview, topList, trendList, trendMax } = await fetchCreatorInsights({
        topSort: this.data.topSort,
        trendMetric: this.data.trendMetric,
        trendRange: this.data.trendRange
      });

      this.setData({
        loading: false,
        overview,
        coreMetrics: [
          { key: 'views', label: '总阅读', value: overview.displayViews },
          { key: 'likes', label: '总获赞', value: overview.displayLikes },
          { key: 'collects', label: '总收藏', value: overview.displayCollects },
          { key: 'comments', label: '总评论', value: overview.displayComments }
        ],
        growthMetrics: [
          {
            key: 'publish',
            label: '已发布',
            value: overview.displayPublish,
            url: '/pages/document/index?type=published'
          },
          {
            key: 'featured',
            label: '精选',
            value: overview.displayFeatured,
            url: ''
          },
          {
            key: 'followers',
            label: '粉丝',
            value: overview.displayFollowers,
            url: '/pages/ucenter/followers/index'
          },
          {
            key: 'visits',
            label: '主页访问',
            value: overview.displayVisits,
            url: '/pages/ucenter/visits/index'
          },
          {
            key: 'rank',
            label: '创作排名',
            value: overview.displayRank,
            url: ''
          }
        ],
        statusItems: [
          {
            type: 'draft',
            name: '草稿',
            count: overview.draftCount,
            url: '/pages/document/index?type=drafts'
          },
          {
            type: 'progress',
            name: '审核中',
            count: overview.progressCount,
            url: '/pages/document/index?type=review'
          },
          {
            type: 'published',
            name: '已发布',
            count: overview.publishCount,
            url: '/pages/document/index?type=published'
          },
          {
            type: 'offline',
            name: '已下架',
            count: overview.offlineCount,
            url: '/pages/document/index?type=offline'
          }
        ],
        topList,
        trendList,
        trendMax,
        updatedText: this._formatNow()
      });
    } catch (e) {
      console.error('[dataCenter] refresh failed', e);
      this.setData({ loading: false, loadError: true });
      wx.showToast({ title: '数据加载失败', icon: 'none' });
    }
  },

  _formatNow() {
    const d = new Date();
    const pad = (n) => `${n}`.padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  onTopSortChange(e) {
    const sort = e.currentTarget.dataset.sort;
    if (!sort || sort === this.data.topSort) return;
    this.setData({ topSort: sort }, () => this.refresh());
  },

  onTrendMetricChange(e) {
    const metric = e.currentTarget.dataset.metric;
    if (!metric || metric === this.data.trendMetric) return;
    this.setData({ trendMetric: metric }, () => this.refresh());
  },

  onTrendRangeChange(e) {
    const range = e.currentTarget?.dataset?.range;
    if (!range || range === this.data.trendRange) return;
    this.setData({ trendRange: range }, () => this.refresh());
  },

  onGrowthTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.url) return;
    wx.navigateTo({ url: item.url });
  },

  onStatusTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.url) return;
    wx.navigateTo({ url: item.url });
  },

  onTopTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/question/detail/index?id=${id}` });
  },

  onRetry() {
    this.refresh();
  }
});
