import Message from 'tdesign-miniprogram/message/index';
import {
  getQuestionBrowseHistory,
  clearQuestionBrowseHistory,
  removeQuestionBrowseById
} from '~/utils/questionBrowseHistory';
import {
  clearServerBrowseHistory,
  fetchServerBrowseHistory,
  hasLoginToken,
  removeServerBrowseHistory
} from '~/utils/practiceBrowse';

const app = getApp();

function formatViewedAt(value) {
  if (!value) return '';
  const ts = typeof value === 'number'
    ? value
    : Date.parse(String(value).replace(/-/g, '/').replace('T', ' '));
  if (Number.isNaN(ts)) return String(value).slice(0, 16);
  const d = new Date(ts);
  const now = new Date();
  const pad = (n) => `${n}`.padStart(2, '0');
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const ySame =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate();
  if (ySame) {
    return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeHistoryRow(row, index) {
  const id = String(row.questionId ?? row.question_id ?? row.id ?? index);
  return {
    id,
    title: row.title || '无标题',
    categoryName: row.categoryName ?? row.category_name ?? '',
    timeText: formatViewedAt(row.viewedAt ?? row.viewed_at),
    idx: index + 1
  };
}

Page({
  data: {
    list: [],
    loading: true,
    useServer: false,
    tipText: '仅保存在本机，最多保留 100 条'
  },

  onShow() {
    this.refreshList();
  },

  async refreshList() {
    this.setData({ loading: true });
    const useServer = hasLoginToken();
    this.setData({
      useServer,
      tipText: useServer ? '已登录，浏览记录云端同步' : '未登录，仅保存在本机（最多 100 条）'
    });

    try {
      if (useServer) {
        const { list } = await fetchServerBrowseHistory(1, 100);
        this.setData({
          list: list.map((row, idx) => normalizeHistoryRow(row, idx))
        });
      } else {
        const raw = getQuestionBrowseHistory();
        this.setData({
          list: raw.map((row, idx) => normalizeHistoryRow({
            id: row.id,
            title: row.title,
            viewedAt: row.viewedAt
          }, idx))
        });
      }
    } catch (e) {
      console.warn('[history] load failed, fallback local', e);
      const raw = getQuestionBrowseHistory();
      this.setData({
        list: raw.map((row, idx) => normalizeHistoryRow({
          id: row.id,
          title: row.title,
          viewedAt: row.viewedAt
        }, idx)),
        tipText: '云端加载失败，已显示本机记录'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onQuestionTap(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    app.navigateToLogin({
      url: `/pages/question/detail/index?id=${id}&title=${encodeURIComponent(title || '')}`
    });
  },

  async onRemoveOne(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    try {
      if (this.data.useServer) {
        await removeServerBrowseHistory(id);
      }
      removeQuestionBrowseById(id);
      this.refreshList();
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 1500,
        content: '已移除'
      });
    } catch (err) {
      Message.error({
        context: this,
        offset: [20, 32],
        content: (err && err.message) || '移除失败'
      });
    }
  },

  onClearAll() {
    const { list } = this.data;
    if (!list.length) return;
    wx.showModal({
      title: '清空浏览历史',
      content: this.data.useServer
        ? '将删除云端与本机的全部浏览记录，且不可恢复。'
        : '将删除本机保存的全部浏览记录，且不可恢复。',
      confirmColor: '#0064ff',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          if (this.data.useServer) {
            await clearServerBrowseHistory();
          }
          clearQuestionBrowseHistory();
          this.refreshList();
          Message.success({
            context: this,
            offset: [20, 32],
            duration: 2000,
            content: '已清空'
          });
        } catch (err) {
          Message.error({
            context: this,
            offset: [20, 32],
            content: (err && err.message) || '清空失败'
          });
        }
      }
    });
  },

  goPractice() {
    wx.switchTab({
      url: '/pages/category/index',
      fail: () => {
        wx.navigateTo({ url: '/pages/category/index' });
      }
    });
  }
});
