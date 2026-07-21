import { socialApi, handleApiError } from '~/api/index';

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    loadDone: false,
    defaultAvatar: '/static/avatar1.png'
  },

  onLoad() {
    this._skipShowRefresh = true;
    this.reload();
  },

  onShow() {
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    this.reload();
  },

  onPullDownRefresh() {
    return this.reload();
  },

  onReachBottom() {
    this.loadList(false);
  },

  reload() {
    this.setData({ list: [], page: 0, hasMore: true, loadDone: false });
    return this.loadList(true);
  },

  async loadList(isRefresh) {
    if (this.data.loading) return;
    if (!isRefresh && !this.data.hasMore) return;
    const nextPage = isRefresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const res = await socialApi.getBlacklist({ page: nextPage, limit: this.data.pageSize });
      const data = res.data || {};
      const rows = data.rows || data.list || [];
      const merged = isRefresh ? rows : this.data.list.concat(rows);
      this.setData({
        list: merged,
        page: nextPage,
        hasMore: merged.length < Number(data.total || rows.length),
        loadDone: true
      });
    } catch (e) {
      handleApiError(e, { fallbackMessage: '加载失败' });
      this.setData({ loadDone: true });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  async onUnblockTap(e) {
    const { userId, index } = e.currentTarget.dataset;
    if (!userId) return;
    try {
      await socialApi.unblockUser(userId);
      const list = this.data.list.slice();
      list.splice(Number(index), 1);
      this.setData({ list });
      wx.showToast({ title: '已解除拉黑', icon: 'none' });
    } catch (err) {
      handleApiError(err, { fallbackMessage: '操作失败' });
    }
  }
});
