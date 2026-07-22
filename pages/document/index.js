import { questionApi, handleApiError } from '~/api/index';
import { DocumentParams } from '~/api/param/param_document';
import documentActionsBehavior from './behaviors/actions';
import documentFilterBehavior from './behaviors/filter';
import { normalizeDocRow, normalizeTabDocType } from '~/utils/documentList';

/**
 * 发布文档列表
 * - behaviors/filter：筛选面板与分类下拉
 * - behaviors/actions：卡片操作菜单与跳转
 */
Page({
  behaviors: [documentFilterBehavior, documentActionsBehavior],

  data: {
    activeTab: 'all',
    docType: 'all',
    sortType: 'time',
    sortOrder: 'desc',
    docList: [],
    page: 1,
    pageSize: 10,
    total: 0,
    loading: false,
    hasMore: true,
  },

  onLoad(options) {
    const { type = 'all' } = options;
    const docType = normalizeTabDocType(type);

    this._skipShowRefresh = true;
    this.setData({
      docType,
      activeTab: docType,
    });

    this.getCategories();
    this.loadDocList(true);
  },

  onShow() {
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    this.getCategories();
    this.loadDocList(true);
  },

  onPullDownRefresh() {
    return Promise.all([this.getCategories(), this.loadDocList(true)]);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadDocList(false);
    }
  },

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
        ...this.data.filterOptions,
      };
      const document = new DocumentParams();
      Object.assign(document, params);

      const res = await questionApi.getPublishList(document);

      if (!res || !res.data) {
        console.warn('API返回数据为空或格式错误:', res);
        this.setData({
          docList: [],
          page,
          total: 0,
          hasMore: false,
          loading: false,
        });
        return;
      }

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
      });
    } catch (error) {
      console.error('加载文档列表失败:', error);
      handleApiError(error, { fallbackMessage: '加载失败' });
      this.setData({
        loading: false,
        docList: [],
        hasMore: false,
        total: 0,
      });
    }
  },

  onTabTap() {},

  onTabChange(e) {
    const raw = e.detail?.value ?? e.detail?.index ?? 'all';
    const typeMap = ['all', 'progress', 'published', 'draft', 'offline'];
    const docType =
      typeof raw === 'string' && typeMap.includes(raw)
        ? raw
        : typeMap[Number(raw)] || normalizeTabDocType(raw);

    this.setData(
      {
        activeTab: docType,
        docType,
      },
      () => {
        this.loadDocList(true);
      },
    );
  },

  onSortChange(e) {
    const { value } = e.currentTarget.dataset;
    const [sortKey, sortOrder] = value.split('-');
    const sortType = sortKey === 'title' ? 'title' : 'time';

    this.setData(
      {
        sortType,
        sortOrder,
      },
      () => {
        this.loadDocList(true);
      },
    );
  },
});
