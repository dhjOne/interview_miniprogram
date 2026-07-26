import Message from 'tdesign-miniprogram/message/index';
import { interviewMemoApi, unwrapData, handleApiError } from '~/api/index';
import { openPage } from '~/utils/router';

const app = getApp();

const STATUS_CHIPS = [
  { label: '全部', value: '' },
  { label: '待复习', value: 'todo' },
  { label: '复习中', value: 'reviewing' },
  { label: '已掌握', value: 'mastered' }
];

const QUICK_TAG_LABELS = ['高频', '八股', '项目追问', '算法', '系统设计'];

function buildQuickTags(selected = []) {
  return QUICK_TAG_LABELS.map((label) => ({
    label,
    selected: selected.includes(label)
  }));
}

const STATUS_TEXT = {
  todo: '待复习',
  reviewing: '复习中',
  mastered: '已掌握'
};

const STATUS_THEME = {
  todo: 'warning',
  reviewing: 'primary',
  mastered: 'success'
};

function formatDate(value) {
  if (!value) return '刚刚';
  const text = String(value).replace('T', ' ');
  return text.slice(0, 10);
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (e) {
      return value
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function normalizeMemo(row = {}) {
  const tags = normalizeTags(row.knowledgeTags);
  const status = row.status || 'todo';
  return {
    ...row,
    knowledgeTags: tags,
    statusText: STATUS_TEXT[status] || '待复习',
    statusTheme: STATUS_THEME[status] || 'warning',
    dateText: formatDate(row.interviewedAt || row.updatedAt || row.createdAt),
    summary: (row.content || '').trim().slice(0, 72)
  };
}

function hasLoginToken() {
  return !!wx.getStorageSync('access_token');
}

Page({
  data: {
    draftTitle: '',
    draftExtraOpen: false,
    draftCompany: '',
    draftPosition: '',
    draftTags: [],
    quickTags: buildQuickTags(),
    savingDraft: false,
    searchValue: '',
    status: '',
    tag: '',
    statusChips: STATUS_CHIPS,
    tagChips: [],
    memoList: [],
    totalCount: 0,
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    loadAttempted: false,
    isLoggedIn: false
  },

  onLoad() {
    this._skipShowRefresh = true;
    const isLoggedIn = hasLoginToken();
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      this.refreshAll();
    } else {
      this.setData({ loadAttempted: true });
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: 'interviewMemo' });
    }
    const isLoggedIn = hasLoginToken();
    this.setData({ isLoggedIn });
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    if (isLoggedIn) {
      this.refreshAll();
    } else {
      this.setData({
        memoList: [],
        totalCount: 0,
        tagChips: [],
        loadAttempted: true
      });
    }
  },

  onPullDownRefresh() {
    if (!hasLoginToken()) {
      wx.stopPullDownRefresh();
      return Promise.resolve();
    }
    return this.refreshAll();
  },

  onReachBottom() {
    this.loadMore();
  },

  async refreshAll() {
    await Promise.all([this.loadTags(), this.loadMemos(true)]);
  },

  ensureLogin(url) {
    app.navigateToLogin({ url: url || '/pages/interviewMemo/index' });
  },

  onDraftChange(e) {
    this.setData({ draftTitle: e.detail.value || '' });
  },

  onToggleExtra() {
    this.setData({ draftExtraOpen: !this.data.draftExtraOpen });
  },

  onDraftCompanyChange(e) {
    this.setData({ draftCompany: e.detail.value || '' });
  },

  onDraftPositionChange(e) {
    this.setData({ draftPosition: e.detail.value || '' });
  },

  onQuickTagTap(e) {
    const tag = e.currentTarget.dataset.tag;
    if (!tag) return;
    const current = this.data.draftTags.slice();
    const index = current.indexOf(tag);
    if (index >= 0) current.splice(index, 1);
    else current.push(tag);
    this.setData({
      draftTags: current,
      quickTags: buildQuickTags(current)
    });
  },

  async onQuickSave() {
    const title = (this.data.draftTitle || '').trim();
    if (!title) {
      wx.showToast({ title: '先写一句面试问题', icon: 'none' });
      return;
    }
    if (!hasLoginToken()) {
      this.ensureLogin('/pages/interviewMemo/index');
      return;
    }
    if (this.data.savingDraft) return;

    this.setData({ savingDraft: true });
    try {
      await interviewMemoApi.create({
        questionTitle: title,
        content: '',
        companyName: (this.data.draftCompany || '').trim(),
        positionName: (this.data.draftPosition || '').trim(),
        knowledgeTags: this.data.draftTags,
        status: 'todo',
        interviewedAt: new Date().toISOString().slice(0, 10)
      });
      this.setData({
        draftTitle: '',
        draftCompany: '',
        draftPosition: '',
        draftTags: [],
        quickTags: buildQuickTags(),
        draftExtraOpen: false
      });
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 1400,
        content: '已速记'
      });
      this.refreshAll();
    } catch (error) {
      handleApiError(error, { fallbackMessage: '保存失败，请重试' });
    } finally {
      this.setData({ savingDraft: false });
    }
  },

  onOpenFullEdit() {
    const title = encodeURIComponent((this.data.draftTitle || '').trim());
    const query = title ? `?title=${title}` : '';
    this.ensureLogin(`/pages/interviewMemo/edit/index${query}`);
  },

  async loadTags() {
    if (!hasLoginToken()) return;
    try {
      const res = await interviewMemoApi.getTags();
      const tags = unwrapData(res) || [];
      this.setData({
        tagChips: Array.isArray(tags) ? tags.slice(0, 20) : []
      });
    } catch (e) {
      console.warn('[interviewMemo] load tags failed', e);
      handleApiError(e, { showToast: false, fallbackMessage: '标签加载失败' });
    }
  },

  async loadMemos(refresh = false) {
    if (!hasLoginToken()) {
      this.setData({
        memoList: [],
        totalCount: 0,
        loadAttempted: true,
        loading: false
      });
      wx.stopPullDownRefresh();
      return;
    }
    if (this.data.loading) return;
    if (!refresh && !this.data.hasMore) return;

    const requestPage = refresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const res = await interviewMemoApi.getList({
        keyword: this.data.searchValue.trim(),
        status: this.data.status,
        tag: this.data.tag,
        page: requestPage,
        limit: this.data.pageSize
      });
      const data = unwrapData(res) || {};
      const rows = (data.rows || []).map(normalizeMemo);
      const total = data.total || 0;

      if (refresh) {
        this.setData({
          memoList: rows,
          totalCount: total,
          page: 1,
          hasMore: rows.length < total,
          loadAttempted: true
        });
      } else {
        const merged = [...this.data.memoList, ...rows];
        this.setData({
          memoList: merged,
          totalCount: total,
          page: requestPage,
          hasMore: merged.length < total,
          loadAttempted: true
        });
      }
    } catch (error) {
      console.error('[interviewMemo] load failed', error);
      handleApiError(error, { fallbackMessage: '速记加载失败，请重试' });
      this.setData({ loadAttempted: true });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  loadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadMemos(false);
    }
  },

  onSearchChange(e) {
    this.setData({ searchValue: e.detail.value || '' });
  },

  triggerSearch(keyword) {
    if (!hasLoginToken()) {
      this.ensureLogin('/pages/interviewMemo/index');
      return;
    }
    const value = (keyword ?? this.data.searchValue ?? '').trim();
    this.setData({ searchValue: value }, () => this.loadMemos(true));
  },

  onSearchSubmit(e) {
    this.triggerSearch(e.detail?.value);
  },

  onSearchAction() {
    this.triggerSearch(this.data.searchValue);
  },

  onSearchClear() {
    this.setData({ searchValue: '' }, () => {
      if (hasLoginToken()) this.loadMemos(true);
    });
  },

  onStatusTap(e) {
    if (!hasLoginToken()) {
      this.ensureLogin('/pages/interviewMemo/index');
      return;
    }
    const status = e.currentTarget.dataset.status || '';
    if (status === this.data.status) return;
    this.setData({ status }, () => this.loadMemos(true));
  },

  onTagTap(e) {
    if (!hasLoginToken()) {
      this.ensureLogin('/pages/interviewMemo/index');
      return;
    }
    const tag = e.currentTarget.dataset.tag || '';
    this.setData({ tag: tag === this.data.tag ? '' : tag }, () => this.loadMemos(true));
  },

  onMemoTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.ensureLogin(`/pages/interviewMemo/edit/index?id=${id}`);
  },

  onRelatedQuestionTap(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    openPage({
      url: `/pages/question/detail/index?id=${id}&title=${encodeURIComponent(title || '')}`
    });
  },

  onDeleteTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除速记',
      content: '删除后不可恢复，确认删除这条面试速记吗？',
      confirmColor: '#d54941',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await interviewMemoApi.remove(id);
          Message.success({
            context: this,
            offset: [20, 32],
            duration: 1600,
            content: '已删除'
          });
          this.refreshAll();
        } catch (error) {
          handleApiError(error, { fallbackMessage: '删除失败，请重试' });
        }
      }
    });
  },

  onLoginTap() {
    this.ensureLogin('/pages/interviewMemo/index');
  }
});
