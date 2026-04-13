import { authApi } from '~/api/request/api_question';
import { DocumentParams } from '~/api/param/param_document';
// 在页面中使用
const app = getApp();

/** 列表卡片日期：YYYY-MM-DD */
function formatDateYMD(value) {
  if (value === undefined || value === null || value === '') return '—';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const mo = `${m[2]}`.padStart(2, '0');
    const d = `${m[3]}`.padStart(2, '0');
    return `${m[1]}-${mo}-${d}`;
  }
  const d = new Date(s.replace(/-/g, '/'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10) || '—';
  const y = d.getFullYear();
  const mo = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * 文档状态统一为：draft | progress | published | offline
 * - 数字 0~3：0 草稿、1 待审、2 已发、3 下架
 * - 英文：draft / progress / published / offline
 * - rejected 等为旧接口兼容
 */
function normalizeDocStatus(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = raw;
    if (n === 0) return 'draft';
    if (n === 1) return 'progress';
    if (n === 2) return 'published';
    if (n === 3) return 'offline';
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (s === '0' || s === 'draft' || s === 'drafts') return 'draft';
  if (s === '1' || s === 'progress' || s === 'review' || s === 'pending' || s === 'auditing') return 'progress';
  if (s === '2' || s === 'published') return 'published';
  if (s === '3' || s === 'offline' || s === 'removed' || s === 'shelved') return 'offline';
  if (s === 'rejected') return 'rejected';
  return null;
}

/** Tab / 路由 query：all 或上述状态；兼容数字与别名 */
function normalizeTabDocType(raw) {
  if (raw === undefined || raw === null || raw === '') return 'all';
  const s0 = typeof raw === 'number' ? String(raw) : String(raw).trim().toLowerCase();
  if (s0 === 'all' || s0 === '全部') return 'all';
  const st = normalizeDocStatus(raw);
  return st || 'all';
}

const STATUS_TAG_MAP = {
  draft: { text: '草稿', theme: 'default' },
  progress: { text: '审核中', theme: 'warning' },
  published: { text: '已发布', theme: 'success' },
  offline: { text: '已下架', theme: 'default' },
  rejected: { text: '已驳回', theme: 'danger' }
};

/** 列表卡片按状态换肤（与 WXML / document/index.less 中 doc-card--* 对应） */
const DOC_CARD_TONE = {
  draft: 'doc-card--draft',
  progress: 'doc-card--progress',
  published: 'doc-card--published',
  offline: 'doc-card--offline',
  rejected: 'doc-card--rejected'
};

function normalizeDocRow(row) {
  const rawTime =
    row.updatedAt ?? row.updated_at ?? row.createdAt ?? row.created_at ?? row.createAt;
  const displayDate = formatDateYMD(rawTime);
  const viewCount = row.viewCount ?? row.view_count ?? 0;
  const commentCount = row.commentCount ?? row.comment_count ?? 0;
  const likeCount = row.likeCount ?? row.like_count ?? 0;
  const rawStatus = row.status ?? row.docStatus ?? row.doc_status ?? row.documentStatus ?? row.state;
  const docStatus = normalizeDocStatus(rawStatus);
  const statusTag =
    docStatus && STATUS_TAG_MAP[docStatus]
      ? STATUS_TAG_MAP[docStatus]
      : rawStatus !== undefined && rawStatus !== null && rawStatus !== ''
        ? { text: '未知', theme: 'default' }
        : null;
  const docCardTone = (docStatus && DOC_CARD_TONE[docStatus]) || 'doc-card--default';
  return {
    ...row,
    status: docStatus != null ? docStatus : row.status,
    displayDate,
    viewCount,
    commentCount,
    likeCount,
    statusTag,
    docCardTone
  };
}

Page({
  data: {
    activeTab: 'all', // 当前激活的tab
    /** 与接口 docType 一致：all | draft | progress | published | offline */
    docType: 'all',
    /** 与筛选栏一致：time | title，请求时映射为 sortField */
    sortType: 'time',
    sortOrder: 'desc', // 排序顺序：asc, desc
    
    // 文档列表
    docList: [],
    page: 1,
    pageSize: 10,
    total: 0,
    loading: false,
    hasMore: true,
    
    // 筛选条件（categoryId 与 DocumentParams / 列表接口一致）
    filterVisible: false,
    filterOptions: {
      categoryId: '',
      timeRange: '',
      tag: ''
    },

    /** 分类选项：{ label, value }[]，首项全部分类 value 为空字符串 */
    categoryDropdownOptions: [{ label: '全部分类', value: '' }],
    /** 筛选项内展示文案：未选具体 id（即全部分类）为「全部分类」，已选为路径缩略 */
    categoryBarTitle: '全部分类',
    /** 筛选项内分类下拉是否展开 */
    categoryDropdownOpen: false,
    timeRanges: [
      { label: '全部时间', value: '' },
      { label: '今天', value: 'today' },
      { label: '近7天', value: 'week' },
      { label: '近30天', value: 'month' }
    ],
    
    // 操作菜单
    actionsVisible: false,
    currentDocId: null
  },

  onLoad(options) {
    const { type = 'all' } = options;
    const docType = normalizeTabDocType(type);

    this.setData({
      docType,
      activeTab: docType
    });
    
    // 获取分类列表
    this.getCategories();
    // 加载文档列表
    this.loadDocList(true);
  },

  onPullDownRefresh() {
    this.loadDocList(true);
    wx.stopPullDownRefresh();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadDocList(false);
    }
  },

  /** 从接口响应中取出分类数组（兼容多种后端包装） */
  _normalizeCategoryList(res) {
    if (Array.isArray(res)) return res;
    const d = res && typeof res === 'object' ? res.data : undefined;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.data)) return d.data;
    if (Array.isArray(d?.list)) return d.list;
    if (Array.isArray(d?.rows)) return d.rows;
    if (Array.isArray(d?.records)) return d.records;
    if (Array.isArray(d?.items)) return d.items;
    if (Array.isArray(d?.categories)) return d.categories;
    if (Array.isArray(res?.list)) return res.list;
    return [];
  },

  /** 根据 id / name / parentId 建树（内部节点） */
  _buildCategoryTreeNodes(list) {
    if (!list || !list.length) return [];
    const nodes = {};
    list.forEach((raw) => {
      const id = raw.id;
      if (id === undefined || id === null) return;
      nodes[id] = {
        id,
        name: raw.name || '未命名',
        parentId: raw.parentId,
        children: []
      };
    });
    const isRootParentId = (pid) => {
      if (pid === undefined || pid === null || pid === '') return true;
      const s = String(pid).trim().toLowerCase();
      return s === '0' || s === '-1' || s === 'null';
    };
    const roots = [];
    list.forEach((raw) => {
      const id = raw.id;
      if (id === undefined || id === null) return;
      const node = nodes[id];
      const pid = raw.parentId;
      const hasParent = !isRootParentId(pid) && nodes[pid];
      const parent = hasParent ? nodes[pid] : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    });
    const sortName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
    const sortDeep = (arr) => {
      arr.sort(sortName);
      arr.forEach((n) => {
        if (n.children.length) sortDeep(n.children);
      });
    };
    sortDeep(roots);
    return roots;
  },

  /** 树展平为下拉项：label 为「父 / 子」路径，value 为分类 id */
  _buildCategoryDropdownOptions(list) {
    const opts = [{ label: '全部分类', value: '' }];
    if (!list || !list.length) return opts;
    const roots = this._buildCategoryTreeNodes(list);
    const walk = (nodes, pathPrefix) => {
      nodes.forEach((n) => {
        const label = pathPrefix ? `${pathPrefix} / ${n.name}` : n.name;
        opts.push({ label, value: n.id });
        if (n.children && n.children.length) {
          walk(n.children, pathPrefix ? `${pathPrefix} / ${n.name}` : n.name);
        }
      });
    };
    walk(roots, '');
    return opts;
  },

  _updateCategoryBarTitle() {
    const id = this.data.filterOptions.categoryId;
    const opts = this.data.categoryDropdownOptions || [];
    if (id === '' || id === undefined || id === null) {
      this.setData({ categoryBarTitle: '全部分类' });
      return;
    }
    const hit = opts.find((o) => o.value == id);
    if (!hit) {
      this.setData({ categoryBarTitle: '全部分类' });
      return;
    }
    const raw = hit.label;
    const max = 18;
    const short = raw.length > max ? `${raw.slice(0, max)}…` : raw;
    this.setData({ categoryBarTitle: short });
  },

  toggleCategoryDropdown() {
    this.setData({
      categoryDropdownOpen: !this.data.categoryDropdownOpen
    });
  },

  onCategoryOptionTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const opts = this.data.categoryDropdownOptions || [];
    const item = opts[idx];
    if (!item) return;
    this.setData(
      {
        'filterOptions.categoryId': item.value === undefined || item.value === null ? '' : item.value,
        categoryDropdownOpen: false
      },
      () => {
        this._updateCategoryBarTitle();
      }
    );
  },

  async getCategories() {
    try {
      const res = await authApi.getPublishDocCategories();
      const list = this._normalizeCategoryList(res);
      const categoryDropdownOptions = this._buildCategoryDropdownOptions(list);
      this.setData({ categoryDropdownOptions }, () => {
        this._updateCategoryBarTitle();
      });
    } catch (error) {
      console.error('获取分类失败:', error);
      this.setData({
        categoryDropdownOptions: [{ label: '全部分类', value: '' }],
        categoryBarTitle: '全部分类'
      });
    }
  },

  // 加载文档列表
  async loadDocList(refresh = true) {
    if (this.data.loading) return;
    
    const page = refresh ? 1 : this.data.page + 1;
    
    this.setData({ loading: true });
    
    try {
      const sortField = this.data.sortType === 'title' ? 'title' : 'created_at';
      const params = {
        docType: this.data.docType || 'all',
        sortField,
        order: this.data.sortOrder,
        page,
        limit: this.data.pageSize,
        ...this.data.filterOptions
      };
      const document = new DocumentParams();
      Object.assign(document, params);
      console.log('加载文档列表参数:', document);

      const res = await authApi.getPublishList(document);
      
      // 添加数据为空或格式错误的处理
      if (!res || !res.data) {
        console.warn('API返回数据为空或格式错误:', res);
        const docList = [];
        const hasMore = false;
        
        this.setData({
          docList,
          page,
          total: 0,
          hasMore,
          loading: false,
          showCreateBtn: docList.length > 0 // 新增一个数据字段
        });
        return;
      }
      console.log('获取到shuj表:', res);
      // 确保数据结构正确
      const responseData = res.data || {};
      const rawList = responseData.rows || [];
      const list = rawList.map(normalizeDocRow);
      const total = responseData.total || 0;

      const docList = refresh ? list : [...this.data.docList, ...list];
      const hasMore = docList.length < total && list.length >= this.data.pageSize;
      
      this.setData({
        docList,
        page,
        total,
        hasMore,
        loading: false,
        showCreateBtn: docList.length > 0 // 新增一个数据字段
      });
    } catch (error) {
      console.error('加载文档列表失败:', error);
      
      // 处理错误情况
      wx.showToast({
        title: '加载失败',
        icon: 'none',
        duration: 2000
      });
      
      this.setData({ 
        loading: false,
        docList: [],
        hasMore: false,
        total: 0
      });
    }
  },

  // Tab切换
  // 同时监听两个事件
onTabTap(e) {
  console.log('tab tap:', e);
},

onTabChange(e) {
  console.log('tab change:', e);
  console.log('detail:', e.detail);

  const raw = e.detail?.value ?? e.detail?.index ?? 'all';
  const typeMap = ['all', 'progress', 'published', 'draft', 'offline'];
  const docType =
    typeof raw === 'string' && typeMap.includes(raw)
      ? raw
      : typeMap[Number(raw)] || normalizeTabDocType(raw);

  this.setData({
    activeTab: docType,
    docType
  }, () => {
    this.loadDocList(true);
  });
},

  // 排序切换（data-value：time-desc / title-asc …）
  onSortChange(e) {
    const { value } = e.currentTarget.dataset;
    const [sortKey, sortOrder] = value.split('-');
    const sortType = sortKey === 'title' ? 'title' : 'time';

    this.setData({
      sortType,
      sortOrder
    }, () => {
      this.loadDocList(true);
    });
  },

  // 筛选
  onFilterClick() {
    this.setData({ filterVisible: true, categoryDropdownOpen: false }, () => {
      this._updateCategoryBarTitle();
    });
  },

  // 筛选条件变化
  onFilterChange(e) {
    const { key, value } = e.currentTarget.dataset;
    this.setData({
      [`filterOptions.${key}`]: value
    });
  },

  // 确认筛选
  onConfirmFilter() {
    this.setData({ filterVisible: false });
    this.loadDocList(true);
  },

  // 重置筛选
  onResetFilter() {
    this.setData(
      {
        filterOptions: {
          categoryId: '',
          timeRange: '',
          tag: ''
        },
        categoryDropdownOpen: false
      },
      () => {
        this._updateCategoryBarTitle();
      }
    );
  },

  onCloseFilter() {
    this.setData({ filterVisible: false, categoryDropdownOpen: false });
  },

  // 打开操作菜单
  onOpenActions(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({
      actionsVisible: true,
      currentDocId: id
    });
  },

  // 关闭操作菜单
  onCloseActions() {
    this.setData({
      actionsVisible: false,
      currentDocId: null
    });
  },

  onActionsPopupVisibleChange(e) {
    if (e.detail && e.detail.visible === false) {
      this.onCloseActions();
    }
  },

  // 文档操作
  onDocAction(e) {
    const { action } = e.currentTarget.dataset;
    const { currentDocId } = this.data;
    
    switch (action) {
      case 'edit':
        this.editDoc(currentDocId);
        break;
      case 'delete':
        this.deleteDoc(currentDocId);
        break;
      case 'preview':
        this.previewDoc(currentDocId);
        break;
      case 'share':
        this.shareDoc(currentDocId);
        break;
    }
    
    this.onCloseActions();
  },

  // 编辑文档（发布 tab 无法用 query，用本地 storage 传 id）
  editDoc(id) {
    if (id === undefined || id === null || id === '') return;
    wx.setStorageSync('release_edit_doc_id', String(id));
    // wx.switchTab({ url: '/pages/release/index' });
    wx.navigateTo({
      url: `/pages/document/edit/index?id=${encodeURIComponent(id)}`,
      fail: function (res) {
        console.log('跳转失败', res);
      }
    });
    // app.navigateToLogin({
    //   url: `/pages/publish/index`,
    //   fail: function (res) {
    //     console.log('跳转失败', res);
    //   }
    // });
  },

  // 删除文档
  async deleteDoc(id) {
    if (id === undefined || id === null || id === '') return;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await authApi.deletePublishDoc(id);
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
          this.loadDocList(true);
        } catch (error) {
          wx.showToast({
            title: error?.message || '删除失败',
            icon: 'none'
          });
        }
      }
    });
  },

  // 预览文档（与发布页预览一致的 towxml 渲染）
  previewDoc(id) {
    if (id === undefined || id === null || id === '') return;
    wx.navigateTo({
      url: `/pages/document/preview/index?id=${encodeURIComponent(id)}`
    });
  },

  // 分享：进入预览页，使用「分享给好友」按钮触发转发
  shareDoc(id) {
    if (id === undefined || id === null || id === '') return;
    wx.navigateTo({
      url: `/pages/document/preview/index?id=${encodeURIComponent(id)}&share=1`
    });
  },

  // 新建文档
  onCreateDoc() {
    try {
      wx.removeStorageSync('release_edit_doc_id');
    } catch (e) {
      // ignore
    }
    wx.switchTab({ url: '/pages/release/index' });
  },

  // 跳转到文档详情
  onDocClick(e) {
    const { id } = e.currentTarget.dataset;
    console.log('点击问题:', id);
    // wx.navigateTo({
    //   url: `/pages/doc/detail/index?id=${id}`
    // });
    // 跳转到问题详情页面
    app.navigateToLogin({
      url: `/pages/question/detail/index?id=${id}`
    });
  },

});