import { socialApi } from '~/api/index';
import {
  NOTIFY_TABS,
  normalizeNotificationRow,
  navigateByNotification
} from '~/utils/notifications';

const EMPTY_LABEL = {
  all: '',
  interact: '互动',
  audit: '审核',
  system: '系统'
};

Page({
  data: {
    tabs: NOTIFY_TABS,
    activeTab: 'all',
    emptyLabel: '',
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    loadDone: false,
    markingAll: false
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

  onChipTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value || value === this.data.activeTab) return;
    this.setData(
      {
        activeTab: value,
        emptyLabel: EMPTY_LABEL[value] || ''
      },
      () => this.reload()
    );
  },

  reload() {
    this.setData({
      list: [],
      page: 0,
      hasMore: true,
      loadDone: false,
      emptyLabel: EMPTY_LABEL[this.data.activeTab] || ''
    });
    return this.loadList(true);
  },

  async loadList(isRefresh) {
    if (this.data.loading) return;
    if (!isRefresh && !this.data.hasMore) return;
    const nextPage = isRefresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const params = {
        page: nextPage,
        limit: this.data.pageSize
      };
      if (this.data.activeTab && this.data.activeTab !== 'all') {
        params.category = this.data.activeTab;
      }
      const res = await socialApi.getNotifications(params);
      const data = res.data || {};
      const rows = (data.rows || data.list || []).map(normalizeNotificationRow);
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

  async onMarkAllRead() {
    if (this.data.markingAll) return;
    if (!this.data.list.some((item) => !item.isRead)) {
      wx.showToast({ title: '暂无未读通知', icon: 'none' });
      return;
    }
    this.setData({ markingAll: true });
    try {
      await socialApi.markAllNotificationsRead();
      const list = this.data.list.map((item) => ({ ...item, isRead: 1 }));
      this.setData({ list });
      wx.showToast({ title: '已全部标为已读', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e?.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ markingAll: false });
    }
  },

  async onNotificationTap(e) {
    const { id, index } = e.currentTarget.dataset;
    if (!id) return;
    const item = this.data.list[index];
    if (!item) return;

    if (!item.isRead) {
      const key = `list[${index}].isRead`;
      this.setData({ [key]: 1 });
      try {
        await socialApi.markNotificationRead(id);
      } catch (err) {
        console.warn('[notifications] 标记已读失败', err);
      }
    }

    navigateByNotification(item);
  }
});
