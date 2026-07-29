import { handleApiError, mobileAdminApi } from '~/api/index';
import { openPage } from '~/utils/router';

const PAGE_SIZE = 10;

const MODULE_META = {
  questions: {
    key: 'questions',
    title: '内容审核',
    desc: '题目与文章发布审核',
    icon: 'edit-1',
    empty: '暂无待审核内容',
  },
  profiles: {
    key: 'profiles',
    title: '资料审核',
    desc: '用户公开主页资料',
    icon: 'user',
    empty: '暂无待审核资料',
  },
  categories: {
    key: 'categories',
    title: '分类建议',
    desc: '处理用户提交的分类',
    icon: 'folder',
    empty: '暂无分类建议',
  },
};

const STATUS_TEXT = {
  0: '草稿',
  1: '待审核',
  2: '已发布',
  3: '已下架',
  4: '已驳回',
};

Page({
  data: {
    loading: true,
    listLoading: false,
    activeModule: 'questions',
    activeTitle: MODULE_META.questions.title,
    activeModuleInfo: {},
    overview: {},
    modules: [],
    rows: [],
    page: 1,
    total: 0,
    hasMore: true,
    emptyText: MODULE_META.questions.empty,
  },

  onLoad() {
    this.loadOverview();
  },

  onShow() {
    if (!wx.getStorageSync('access_token')) {
      openPage({ url: '/pages/login/login' });
    }
  },

  onPullDownRefresh() {
    this.refreshCurrent().finally(() => wx.stopPullDownRefresh());
  },

  async loadOverview() {
    this.setData({ loading: true });
    try {
      const res = await mobileAdminApi.getOverview();
      const overview = res.data || {};
      if (!overview.hasAccess) {
        this.setData({ loading: false, overview, modules: [], rows: [] });
        return;
      }

      const modules = this.buildModules(overview);
      const currentModule = this.data.activeModule;
      const activeModule = modules.some((item) => item.key === currentModule)
        ? currentModule
        : modules[0]?.key || 'questions';
      this.setData({
        overview,
        modules,
        activeModule,
        activeTitle: MODULE_META[activeModule]?.title || '待办审批',
        activeModuleInfo: modules.find((item) => item.key === activeModule) || {},
        loading: false,
      });
      await this.loadList(true);
    } catch (e) {
      this.setData({ loading: false });
      handleApiError(e, { fallbackMessage: '移动管理台加载失败' });
    }
  },

  buildModules(overview) {
    return Object.keys(MODULE_META)
      .map((key) => ({
        ...MODULE_META[key],
        ...(overview[key] || {}),
      }))
      .filter((item) => item.visible);
  },

  async refreshCurrent() {
    await this.loadOverview();
  },

  onModuleTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeModule) return;
    this.setData(
      {
        activeModule: key,
        activeTitle: MODULE_META[key]?.title || '待办审批',
        activeModuleInfo: this.data.modules.find((item) => item.key === key) || {},
        page: 1,
        rows: [],
        hasMore: true,
        total: 0,
      },
      () => {
        this.loadList(true);
      },
    );
  },

  onReachBottom() {
    this.loadMore();
  },

  onListLower() {
    this.loadMore();
  },

  loadMore() {
    if (this.data.listLoading || !this.data.hasMore) return;
    this.setData({ page: this.data.page + 1 }, () => this.loadList(false));
  },

  async loadList(reset = false) {
    const moduleKey = this.data.activeModule;
    const page = reset ? 1 : this.data.page;
    this.setData({
      listLoading: true,
      page,
      emptyText: MODULE_META[moduleKey]?.empty || '暂无数据',
    });

    try {
      const res = await this.fetchModuleList(moduleKey, page);
      const data = res.data || {};
      const nextRows = this.normalizeRows(moduleKey, data.rows || []);
      const rows = reset ? nextRows : this.data.rows.concat(nextRows);
      const total = Number(data.total || 0);
      this.setData({
        rows,
        total,
        hasMore: rows.length < total,
        listLoading: false,
      });
    } catch (e) {
      this.setData({ listLoading: false });
      handleApiError(e, { fallbackMessage: '列表加载失败' });
    }
  },

  fetchModuleList(moduleKey, page) {
    const params = { page, limit: PAGE_SIZE };
    if (moduleKey === 'questions') {
      return mobileAdminApi.getQuestions({ ...params, docType: 'progress' });
    }
    if (moduleKey === 'profiles') {
      return mobileAdminApi.getProfiles({ ...params, auditStatus: 0 });
    }
    return mobileAdminApi.getCategorySuggestions({ ...params, status: 0 });
  },

  normalizeRows(moduleKey, rows) {
    return rows.map((row) => {
      if (moduleKey === 'questions') {
        const status = row.status == null ? '' : String(row.status);
        return {
          ...row,
          statusText: STATUS_TEXT[status] || STATUS_TEXT[Number(status)] || '待审核',
          metaText: `${row.categoryName || '未分类'} · ${row.createName || `用户#${row.createId || '-'}`}`,
          contentPreview: this.trimText(row.previewFullContent || row.content || '暂无正文预览', 92),
        };
      }
      if (moduleKey === 'profiles') {
        return {
          ...row,
          nameText: row.nickname || `用户#${row.userId}`,
          bioText: this.trimText(row.bio || '这个人很懒，什么都没有写', 72),
          statsText: `发布 ${row.publishCount || 0} · 粉丝 ${row.followerCount || 0} · 举报 ${row.reportCount || 0}`,
        };
      }
      return {
        ...row,
        reasonText: this.trimText(row.reason || '用户希望新增更合适的分类', 72),
        submitText: `用户#${row.userId || '-'} · ${this.formatDate(row.createdAt)}`,
      };
    });
  },

  trimText(text, maxLength) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
  },

  formatDate(value) {
    if (!value) return '刚刚';
    return String(value).replace('T', ' ').slice(0, 16);
  },

  confirmAction(content, success) {
    wx.showModal({
      title: '确认操作',
      content,
      confirmText: '确定',
      success: (res) => {
        if (res.confirm) {
          Promise.resolve(success()).catch((e) => {
            handleApiError(e, { fallbackMessage: '操作失败，请重试' });
          });
        }
      },
    });
  },

  promptReason(title, placeholder, success) {
    wx.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      confirmText: '提交',
      success: (res) => {
        if (!res.confirm) return;
        const reason = (res.content || '').trim();
        if (!reason) {
          wx.showToast({ title: '请填写原因', icon: 'none' });
          return;
        }
        Promise.resolve(success(reason)).catch((e) => {
          handleApiError(e, { fallbackMessage: '操作失败，请重试' });
        });
      },
    });
  },

  async afterAction(message) {
    wx.showToast({ title: message, icon: 'success' });
    await this.loadOverview();
  },

  onApproveQuestion(e) {
    const row = e.currentTarget.dataset.row;
    this.confirmAction(`确认通过《${row.title || row.id}》？`, async () => {
      await mobileAdminApi.approveQuestion(row.id);
      await this.afterAction('已通过');
    });
  },

  onRejectQuestion(e) {
    const row = e.currentTarget.dataset.row;
    this.confirmAction(`确认驳回《${row.title || row.id}》？`, async () => {
      await mobileAdminApi.rejectQuestion(row.id);
      await this.afterAction('已驳回');
    });
  },

  onApproveProfile(e) {
    const row = e.currentTarget.dataset.row;
    this.confirmAction(`确认通过 ${row.nameText || row.userId} 的主页资料？`, async () => {
      await mobileAdminApi.approveProfile(row.userId);
      await this.afterAction('已通过');
    });
  },

  onRejectProfile(e) {
    const row = e.currentTarget.dataset.row;
    this.promptReason('驳回主页资料', '例如：头像或简介包含违规内容', async (reason) => {
      await mobileAdminApi.rejectProfile({ userId: row.userId, reason });
      await this.afterAction('已驳回');
    });
  },

  onResetProfile(e) {
    const row = e.currentTarget.dataset.row;
    this.confirmAction(`确认重置 ${row.nameText || row.userId} 的公开资料？`, async () => {
      await mobileAdminApi.resetProfile(row.userId);
      await this.afterAction('已重置');
    });
  },

  onAcceptCategory(e) {
    const row = e.currentTarget.dataset.row;
    this.confirmAction(`确认采纳“${row.suggestedName}”并创建分类？`, async () => {
      await mobileAdminApi.handleCategorySuggestion({
        suggestionId: row.id,
        status: 1,
        createCategory: true,
        categoryName: row.suggestedName,
      });
      await this.afterAction('已采纳');
    });
  },

  onRejectCategory(e) {
    const row = e.currentTarget.dataset.row;
    this.promptReason('驳回分类建议', '请输入处理说明', async (handleResult) => {
      await mobileAdminApi.handleCategorySuggestion({
        suggestionId: row.id,
        status: 2,
        handleResult,
      });
      await this.afterAction('已驳回');
    });
  },
});
