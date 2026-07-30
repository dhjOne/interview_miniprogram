import { handleApiError, mobileAdminApi } from '~/api/index';
import { openPage } from '~/utils/router';

const PAGE_SIZE = 10;

const MODULE_META = {
  questions: {
    key: 'questions',
    title: '内容审核',
    shortTitle: '内容',
    desc: '题目与文章发布审核',
    icon: 'edit-1',
    tone: 'warning',
    empty: '暂无待审核内容',
  },
  profiles: {
    key: 'profiles',
    title: '资料审核',
    shortTitle: '资料',
    desc: '用户公开主页资料',
    icon: 'user',
    tone: 'brand',
    empty: '暂无待审核资料',
  },
  categories: {
    key: 'categories',
    title: '分类建议',
    shortTitle: '分类',
    desc: '处理用户提交的分类',
    icon: 'folder',
    tone: 'brand',
    empty: '暂无分类建议',
  },
  reports: {
    key: 'reports',
    title: '举报处理',
    shortTitle: '举报',
    desc: '用户举报待处理',
    icon: 'error-circle',
    tone: 'danger',
    empty: '暂无待处理举报',
  },
  comments: {
    key: 'comments',
    title: '评论治理',
    shortTitle: '评论',
    desc: '隐藏不当评论',
    icon: 'chat',
    tone: 'neutral',
    empty: '暂无评论',
  },
  leads: {
    key: 'leads',
    title: '商务线索',
    shortTitle: '线索',
    desc: '合作线索跟进',
    icon: 'usergroup',
    tone: 'brand',
    empty: '暂无待处理线索',
  },
  appeals: {
    key: 'appeals',
    title: '积分申诉',
    shortTitle: '申诉',
    desc: '积分扣减申诉',
    icon: 'wallet',
    tone: 'warning',
    empty: '暂无待处理申诉',
  },
  published: {
    key: 'published',
    title: '内容下架',
    shortTitle: '下架',
    desc: '已发布内容紧急下架',
    icon: 'close-circle',
    tone: 'danger',
    empty: '暂无已发布内容',
  },
};

const STATUS_TEXT = {
  0: '草稿',
  1: '待审核',
  2: '已发布',
  3: '已下架',
  4: '已驳回',
};

const REPORT_ACTION_OPTIONS = [
  { label: '仅标记已处理', action: 'NONE' },
  { label: '警告用户', action: 'WARN' },
  { label: '隐藏内容', action: 'HIDE_CONTENT' },
  { label: '重置主页资料', action: 'RESET_PROFILE' },
  { label: '禁言用户', action: 'MUTE_USER' },
  { label: '封禁用户', action: 'BAN_USER' },
];

Page({
  data: {
    loading: true,
    listLoading: false,
    activeModule: 'questions',
    activeTitle: MODULE_META.questions.title,
    activeDesc: MODULE_META.questions.desc,
    activeModuleInfo: {},
    overview: {},
    modules: [],
    totalPending: 0,
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
      const activeMeta = MODULE_META[activeModule] || {};
      const totalPending = modules.reduce((sum, item) => sum + (Number(item.pendingCount) || 0), 0);
      this.setData({
        overview,
        modules,
        totalPending,
        activeModule,
        activeTitle: activeMeta.title || '待办审批',
        activeDesc: activeMeta.desc || '',
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
      .map((key) => {
        const meta = MODULE_META[key];
        const raw = overview[key] || {};
        const pendingCount = Number(raw.pendingCount) || 0;
        return {
          ...meta,
          ...raw,
          pendingCount,
          hasPending: pendingCount > 0,
          badgeText: pendingCount > 99 ? '99+' : pendingCount > 0 ? String(pendingCount) : '',
        };
      })
      .filter((item) => item.visible);
  },

  async refreshCurrent() {
    await this.loadOverview();
  },

  onModuleTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeModule) return;
    const meta = MODULE_META[key] || {};
    this.setData(
      {
        activeModule: key,
        activeTitle: meta.title || '待办审批',
        activeDesc: meta.desc || '',
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
    if (moduleKey === 'published') {
      return mobileAdminApi.getQuestions({ ...params, docType: 'published' });
    }
    if (moduleKey === 'profiles') {
      return mobileAdminApi.getProfiles({ ...params, auditStatus: 0 });
    }
    if (moduleKey === 'categories') {
      return mobileAdminApi.getCategorySuggestions({ ...params, status: 0 });
    }
    if (moduleKey === 'reports') {
      return mobileAdminApi.getReports({ ...params, status: 0 });
    }
    if (moduleKey === 'comments') {
      return mobileAdminApi.getComments({ ...params, status: 0 });
    }
    if (moduleKey === 'leads') {
      return mobileAdminApi.getBusinessLeads({ ...params, status: 0 });
    }
    if (moduleKey === 'appeals') {
      return mobileAdminApi.getAppeals({ page, size: PAGE_SIZE });
    }
    return Promise.resolve({ data: { rows: [], total: 0 } });
  },

  normalizeRows(moduleKey, rows) {
    return rows.map((row) => {
      if (moduleKey === 'questions' || moduleKey === 'published') {
        const status = row.status == null ? '' : String(row.status);
        return {
          ...row,
          statusText: STATUS_TEXT[status] || STATUS_TEXT[Number(status)] || '待审核',
          metaText: `${row.categoryName || '未分类'} · ${
            row.createName || `用户#${row.createId || '-'}`
          }`,
          contentPreview: this.trimText(
            row.previewFullContent || row.content || '暂无正文预览',
            92,
          ),
        };
      }
      if (moduleKey === 'profiles') {
        return {
          ...row,
          nameText: row.nickname || `用户#${row.userId}`,
          bioText: this.trimText(row.bio || '这个人很懒，什么都没有写', 72),
          statsText: `发布 ${row.publishCount || 0} · 粉丝 ${row.followerCount || 0} · 举报 ${
            row.reportCount || 0
          }`,
        };
      }
      if (moduleKey === 'categories') {
        const parentId = row.parentId;
        const fallbackCategoryId = row.fallbackCategoryId;
        const questionId = row.questionId;
        return {
          ...row,
          reasonText: this.trimText(row.reason || '', 120),
          hasReason: !!(row.reason && String(row.reason).trim()),
          submitText: `用户#${row.userId || '-'} · ${this.formatDate(row.createdAt)}`,
          parentText: parentId ? `父级 #${parentId}` : '挂靠根级 / 未指定',
          fallbackText: fallbackCategoryId ? `发布时选用 #${fallbackCategoryId}` : '',
          questionText: questionId ? `关联文档 #${questionId}` : '',
          hasContext: !!(parentId || fallbackCategoryId || questionId),
        };
      }
      if (moduleKey === 'reports') {
        return {
          ...row,
          titleText: row.targetTitle || `${row.targetType || '内容'}#${row.targetId || '-'}`,
          metaText: `${row.reasonType || '其他'} · 举报人 ${
            row.reporterNickname || `#${row.reporterId || '-'}`
          }`,
          reasonText: this.trimText(row.reason || '未填写说明', 80),
          targetUserText: row.targetUserNickname || `用户#${row.targetUserId || '-'}`,
        };
      }
      if (moduleKey === 'comments') {
        return {
          ...row,
          titleText: row.questionTitle || `题目#${row.questionId || '-'}`,
          metaText: `${row.userNickname || `用户#${row.userId || '-'}`} · ${this.formatDate(
            row.createdAt,
          )}`,
          contentPreview: this.trimText(row.content || '无内容', 90),
        };
      }
      if (moduleKey === 'leads') {
        return {
          ...row,
          titleText: row.companyName || '未填写公司',
          metaText: `${row.contactName || '-'} · ${row.phone || '-'}`,
          reasonText: this.trimText(row.requirement || '未填写需求', 90),
          typeText: row.cooperationType || row.cooperationTypeCustom || '合作咨询',
        };
      }
      if (moduleKey === 'appeals') {
        return {
          ...row,
          titleText: `申诉 #${row.id}`,
          metaText: `用户#${row.userId || '-'} · 流水#${row.ledgerId || '-'}`,
          reasonText: this.trimText(row.reason || '未填写申诉原因', 90),
        };
      }
      return row;
    });
  },

  trimText(text, maxLength) {
    const value = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
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
    this.promptReason('驳回内容', '例如：内容不完整或不符合发布规范', async (reason) => {
      await mobileAdminApi.rejectQuestion(row.id, { reason });
      await this.afterAction('已驳回');
    });
  },

  onOfflineQuestion(e) {
    const row = e.currentTarget.dataset.row;
    this.confirmAction(`确认下架《${row.title || row.id}》？此操作会通知作者。`, async () => {
      await mobileAdminApi.offlineQuestion(row.id);
      await this.afterAction('已下架');
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
    this.confirmAction(`确认采纳「${row.suggestedName}」并创建分类？`, async () => {
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

  onHandleReport(e) {
    const row = e.currentTarget.dataset.row;
    wx.showActionSheet({
      itemList: REPORT_ACTION_OPTIONS.map((item) => item.label),
      success: (res) => {
        const option = REPORT_ACTION_OPTIONS[res.tapIndex];
        if (!option) return;
        const dangerous = option.action === 'MUTE_USER' || option.action === 'BAN_USER';
        const run = () => {
          this.promptReason('处理说明', '请填写处理说明', async (handleResult) => {
            await mobileAdminApi.handleReport(row.id, {
              status: 1,
              action: option.action,
              handleResult,
            });
            await this.afterAction('已处理');
          });
        };
        if (dangerous) {
          this.confirmAction(`确认对目标执行「${option.label}」？此为高风险操作。`, run);
        } else {
          run();
        }
      },
    });
  },

  onRejectReport(e) {
    const row = e.currentTarget.dataset.row;
    this.promptReason('驳回举报', '请填写驳回说明', async (handleResult) => {
      await mobileAdminApi.handleReport(row.id, {
        status: 2,
        action: 'NONE',
        handleResult,
      });
      await this.afterAction('已驳回');
    });
  },

  onHideComment(e) {
    const row = e.currentTarget.dataset.row;
    this.confirmAction(`确认隐藏该评论？`, async () => {
      await mobileAdminApi.hideComment(row.id);
      await this.afterAction('已隐藏');
    });
  },

  onFollowLead(e) {
    const row = e.currentTarget.dataset.row;
    this.promptReason('跟进备注', '记录沟通进展', async (remark) => {
      await mobileAdminApi.handleBusinessLead(row.id, { status: 1, remark });
      await this.afterAction('已标记跟进');
    });
  },

  onCloseLead(e) {
    const row = e.currentTarget.dataset.row;
    this.promptReason('关闭备注', '说明关闭原因', async (remark) => {
      await mobileAdminApi.handleBusinessLead(row.id, { status: 2, remark });
      await this.afterAction('已关闭');
    });
  },

  onApproveAppeal(e) {
    const row = e.currentTarget.dataset.row;
    this.confirmAction(`确认通过申诉 #${row.id}？将按原流水返还积分。`, async () => {
      await mobileAdminApi.resolveAppeal({
        appealId: row.id,
        approved: true,
        adminRemark: '申诉通过',
      });
      await this.afterAction('已通过');
    });
  },

  onRejectAppeal(e) {
    const row = e.currentTarget.dataset.row;
    this.promptReason('驳回申诉', '请填写驳回原因', async (adminRemark) => {
      await mobileAdminApi.resolveAppeal({
        appealId: row.id,
        approved: false,
        adminRemark,
      });
      await this.afterAction('已驳回');
    });
  },

  onCopyLeadPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    if (!phone) {
      wx.showToast({ title: '无手机号', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: String(phone),
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },
});
