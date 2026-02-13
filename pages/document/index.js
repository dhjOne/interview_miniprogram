import request from '~/api/request';
import { authApi } from '~/api/request/api_question';
import { QuestionParams } from '~/api/param/param_question';

Page({
  data: {
    activeTab: 'all', // 当前激活的tab
    docType: 'all', // 文档类型：all, progress, published, draft
    sortType: 'time', // 排序方式：time, title, update
    sortOrder: 'desc', // 排序顺序：asc, desc
    
    // 文档列表
    docList: [],
    page: 1,
    pageSize: 10,
    total: 0,
    loading: false,
    hasMore: true,
    
    // 筛选条件
    filterVisible: false,
    filterOptions: {
      category: '', // 分类筛选
      timeRange: '', // 时间范围
      tag: '' // 标签筛选
    },
    
    // 分类选项
    categories: [],
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
    const tabMap = {
      'all': 0,
      'progress': 1,
      'published': 2,
      'draft': 3
    };
    
    this.setData({
      docType: type,
      activeTab: tabMap[type] || 0
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

  // 获取分类列表
  async getCategories() {
    try {
      const res = await request('/api/getCategories');
      this.setData({
        categories: [{ label: '全部分类', value: '' }, ...res.data.data]
      });
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  },

  // 加载文档列表
  async loadDocList(refresh = true) {
    if (this.data.loading) return;
    
    const page = refresh ? 1 : this.data.page + 1;
    
    this.setData({ loading: true });
    
    try {
      const params = {
        type: this.data.docType,
        sortField: this.data.sortType,
        order: this.data.sortOrder,
        page,
        limit: this.data.pageSize,
        ...this.data.filterOptions
      };
      
      console.log('加载文档列表参数:', params);

      const res = await authApi.getPublishList(params);
      
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
      const list = responseData.rows || [];
      const total = responseData.total || 0;
      
      console.log('获取到的文档列表:', responseData);
      console.log('总数:', total);
      
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
  
  // 有些版本的 TDesign 使用 e.detail.index 而不是 e.detail.value
  const value = e.detail?.value ?? e.detail?.index ?? 0;
  
  const typeMap = ['all', 'progress', 'published', 'draft'];
  
  this.setData({
    activeTab: value,
    docType: typeMap[value]
  }, () => {
    this.loadDocList(true);
  });
},

  // 排序切换
  onSortChange(e) {
    const { value } = e.currentTarget.dataset;
    const [sortType, sortOrder] = value.split('-');
    
    this.setData({
      sortType,
      sortOrder
    }, () => {
      this.loadDocList(true);
    });
  },

  // 筛选
  onFilterClick() {
    this.setData({ filterVisible: true });
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
    this.setData({
      filterOptions: {
        category: '',
        timeRange: '',
        tag: ''
      }
    });
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

  // 编辑文档
  editDoc(id) {
    wx.navigateTo({
      url: `/pages/doc/edit/index?id=${id}`
    });
  },

  // 删除文档
  async deleteDoc(id) {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await request('/api/deleteDoc', { id });
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });
            this.loadDocList(true);
          } catch (error) {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 预览文档
  previewDoc(id) {
    wx.navigateTo({
      url: `/pages/doc/detail/index?id=${id}`
    });
  },

  // 分享文档
  shareDoc(id) {
    wx.showShareMenu({
      withShareTicket: true
    });
  },

  // 新建文档
  onCreateDoc() {
    wx.navigateTo({
      url: '/pages/doc/edit/index'
    });
  },

  // 跳转到文档详情
  onDocClick(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/doc/detail/index?id=${id}`
    });
  },

  // 获取状态标签
  getStatusTag(status) {
    console.log('zhaodadadadasd',status)
    const statusMap = {
      'draft': { text: '草稿', theme: 'default' },
      'progress': { text: '审核中', theme: 'warning' },
      'published': { text: '已发布', theme: 'success' },
      'rejected': { text: '已驳回', theme: 'danger' }
    };
    return statusMap[status] || { text: '未知', theme: 'default' };
  },

  // 格式化时间
  formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 24 * 60 * 60 * 1000) {
      return '今天';
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}天前`;
    }
    return `${date.getMonth() + 1}-${date.getDate()}`;
  }
});