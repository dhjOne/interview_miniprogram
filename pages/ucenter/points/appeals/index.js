import { fetchPointAppeals } from '~/utils/points';

Page({
  data: {
    appealList: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20
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

  onReachBottom() {
    this.loadAppeals(false);
  },

  onPullDownRefresh() {
    return this.reload();
  },

  reload() {
    return new Promise((resolve) => {
      this.setData({ appealList: [], page: 0, hasMore: true }, () => {
        resolve(this.loadAppeals(true));
      });
    });
  },

  async loadAppeals(isRefresh) {
    if (this.data.loading) return;
    if (!isRefresh && !this.data.hasMore) return;

    const nextPage = isRefresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const { list, total } = await fetchPointAppeals(nextPage, this.data.pageSize);
      const merged = isRefresh ? list : [...this.data.appealList, ...list];
      const hasMore = typeof total === 'number' ? merged.length < total : list.length >= this.data.pageSize;
      this.setData({ appealList: merged, page: nextPage, hasMore });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
