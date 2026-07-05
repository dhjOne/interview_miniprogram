import { socialApi } from '~/api/request/api_social';

function formatTime(value) {
  if (!value) return '';
  return String(value).replace('T', ' ').slice(0, 16);
}

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    loadDone: false
  },

  onLoad() {
    this.reload();
  },

  onPullDownRefresh() {
    return this.reload();
  },

  onReachBottom() {
    this.loadList(false);
  },

  reload() {
    this.setData({
      list: [],
      page: 0,
      hasMore: true,
      loadDone: false
    });
    return this.loadList(true);
  },

  async loadList(isRefresh) {
    if (this.data.loading) return;
    if (!isRefresh && !this.data.hasMore) return;
    const nextPage = isRefresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const res = await socialApi.getNotifications({
        page: nextPage,
        limit: this.data.pageSize
      });
      const data = res.data || {};
      const rows = (data.rows || data.list || []).map(item => ({
        ...item,
        timeText: formatTime(item.createdAt || item.createTime)
      }));
      const total = Number(data.total || rows.length);
      const list = isRefresh ? rows : this.data.list.concat(rows);
      this.setData({
        list,
        page: nextPage,
        hasMore: list.length < total,
        loadDone: true
      });
    } catch (e) {
      wx.showToast({ title: e?.message || '加载失败', icon: 'none' });
      this.setData({ loadDone: true });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  async onNotificationTap(e) {
    const { id, index } = e.currentTarget.dataset;
    if (!id) return;
    const key = `list[${index}].isRead`;
    this.setData({ [key]: 1 });
    try {
      await socialApi.markNotificationRead(id);
    } catch (err) {
      console.warn('[notifications] 标记已读失败', err);
    }
  }
});
