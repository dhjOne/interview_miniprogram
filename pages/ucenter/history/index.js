import Message from 'tdesign-miniprogram/message/index';
import { handleApiError } from '~/api/index';
import {
  clearQuestionBrowseHistory,
  removeQuestionBrowseById
} from '~/utils/questionBrowseHistory';
import {
  clearServerBrowseHistory,
  fetchMergedBrowseHistory,
  hasLoginToken,
  removeServerBrowseHistory
} from '~/utils/practiceBrowse';
import { openPage } from '~/utils/router';

const app = getApp();

function toTimestamp(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const ts = Date.parse(String(value).replace(/-/g, '/').replace('T', ' '));
  return Number.isNaN(ts) ? 0 : ts;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function pad(n) {
  return `${n}`.padStart(2, '0');
}

function resolveGroupMeta(ts) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const d = ts ? new Date(ts) : null;

  if (!d || !ts) {
    return { groupKey: 'earlier', groupLabel: '更早' };
  }
  if (ts >= todayStart) {
    return { groupKey: 'today', groupLabel: '今天' };
  }
  if (ts >= yesterdayStart) {
    return { groupKey: 'yesterday', groupLabel: '昨天' };
  }
  return {
    groupKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    groupLabel: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  };
}

function formatClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)} 小时前`;
  return formatClock(ts);
}

function normalizeHistoryRow(row, index) {
  const id = String(row.questionId ?? row.question_id ?? row.id ?? index);
  const ts = toTimestamp(row.viewedAt ?? row.viewed_at);
  const group = resolveGroupMeta(ts);
  return {
    id,
    title: row.title || '无标题',
    categoryName: row.categoryName ?? row.category_name ?? '',
    viewedAt: ts,
    timeText: formatRelativeTime(ts),
    clockText: formatClock(ts),
    groupKey: group.groupKey,
    groupLabel: group.groupLabel
  };
}

function buildGroupedList(rows) {
  const groups = [];
  const indexMap = new Map();

  rows.forEach((row) => {
    let group = indexMap.get(row.groupKey);
    if (!group) {
      group = {
        key: row.groupKey,
        label: row.groupLabel,
        items: []
      };
      indexMap.set(row.groupKey, group);
      groups.push(group);
    }
    group.items.push(row);
  });

  return groups.map((group) => ({
    ...group,
    count: group.items.length
  }));
}

Page({
  data: {
    list: [],
    groups: [],
    totalCount: 0,
    loading: true,
    useServer: false,
    syncLabel: '本机记录',
    tipText: '浏览过的题目会出现在这里'
  },

  onShow() {
    this.refreshList();
  },

  onPullDownRefresh() {
    return this.refreshList();
  },

  async refreshList() {
    this.setData({ loading: true });

    try {
      const result = await fetchMergedBrowseHistory(1, 100);
      const useServer = !!result.useServer;
      let syncLabel = useServer ? '已云端同步' : '仅本机保存';
      let tipText = useServer
        ? '登录后可在多端查看你的学习足迹'
        : '未登录时记录保存在本机，最多 100 条';
      if (result.serverFailed) {
        syncLabel = '本机兜底';
        tipText = '云端暂时不可用，已展示本机记录';
      }

      const list = (result.list || []).map((row, idx) => normalizeHistoryRow(row, idx));
      const groups = buildGroupedList(list);

      this.setData({
        useServer: useServer || hasLoginToken(),
        syncLabel,
        tipText,
        list,
        groups,
        totalCount: list.length
      });
    } catch (e) {
      console.warn('[history] load failed', e);
      this.setData({
        list: [],
        groups: [],
        totalCount: 0,
        tipText: '加载失败，请下拉重试',
        syncLabel: '加载失败',
        useServer: hasLoginToken()
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
      if (this.data.useServer && hasLoginToken()) {
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
      handleApiError(err, { fallbackMessage: '移除失败' });
    }
  },

  onClearAll() {
    const { list } = this.data;
    if (!list.length) return;
    wx.showModal({
      title: '清空浏览历史',
      content: this.data.useServer && hasLoginToken()
        ? '将删除云端与本机的全部浏览记录，且不可恢复。'
        : '将删除本机保存的全部浏览记录，且不可恢复。',
      confirmColor: '#0052d9',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          if (this.data.useServer && hasLoginToken()) {
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
          handleApiError(err, { fallbackMessage: '清空失败' });
        }
      }
    });
  },

  goPractice() {
    openPage({ url: '/pages/category/index' });
  }
});
