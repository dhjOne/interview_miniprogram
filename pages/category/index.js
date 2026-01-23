import Message from 'tdesign-miniprogram/message';
import { authApi } from '~/api/request/api_category';
import { CategoryParams } from '~/api/param/param_category';
import { QuestionParams } from '~/api/param/param_category';
import { BusinessError } from '~/api/api_request';

const app = getApp();

Page({
  data: {
    isSidebarCollapsed: false,
    currentPrimary: null,
    currentSecondary: null,
    scrollLeft: 0,
    primaryCategories: [],
    secondaryCategories: [],
    currentQuestions: [],
    navBarHeight: 90,
    enable: false,
    loading: false,
    lastRefreshTime: 0,
    needRefresh: false,
    showSecondarySidebar: true,
    messageOffset: 100,
    
    // 分页相关数据
    page: 1,
    pageSize: 10,
    hasMore: true,
    isLoadingMore: false,
    total: 0,
    scrollTop: 0,
    isScrolling: false
  },

  onLoad() {
    console.log('页面加载开始');
    this.calculateNavBarHeight();
    this.loadPrimaryCategories();

    app.on('refreshQuestionBank', this.handleRefresh.bind(this));
  },

  onUnload() {
    app.off('refreshQuestionBank', this.handleRefresh);
  },

  handleRefresh() {
    console.log('收到刷新指令');
    this.setData({ needRefresh: true });
    
    if (this.data.currentPrimary) {
      this.refreshCurrentData();
    }
  },

  onShow() {
    console.log('页面显示');
    const now = Date.now();
    const shouldRefresh = this.data.needRefresh || 
                        (now - this.data.lastRefreshTime > 5 * 60 * 1000) ||
                        !this.data.primaryCategories.length;
    
    if (shouldRefresh && this.data.currentPrimary) {
      this.refreshCurrentData();
      this.setData({ needRefresh: false });
    }
  },
  
  onHide() {
    console.log('页面隐藏');
    this.setData({
      lastRefreshTime: Date.now()
    });
  },
  
  async refreshCurrentData() {
    console.log('刷新当前页面数据');
    
    try {
      this.setData({ loading: true });
      await this.loadSecondaryCategories();
      
      if (this.data.currentSecondary) {
        // 刷新时重置分页
        this.resetPagination();
        await this.loadQuestions();
      }
      this.showSuccessMessage('数据已更新');
    } catch (error) {
      console.error('刷新数据失败:', error);
      this.showErrorMessage('刷新失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 重置分页参数
  resetPagination() {
    this.setData({
      page: 1,
      hasMore: true,
      isLoadingMore: false,
      total: 0,
      currentQuestions: []
    });
  },

  // 加载一级分类
  async loadPrimaryCategories() {
    try {
      this.setData({ loading: true });
      console.log('开始加载数据')
      const categoryParams = new CategoryParams(null, 0)
      categoryParams.sortField = 'sort_order'
      categoryParams.order = 'asc'
      const response = await authApi.getCategories(categoryParams);
      console.log('一级分类：：', response);
      const primaryCategories = response.data.rows;
      this.setData({
        primaryCategories: primaryCategories,
        currentPrimary: primaryCategories[0]?.id || null
      });
      if (this.data.currentPrimary) {
        await this.loadSecondaryCategories();
      }
    } catch (error) {
      console.error('加载一级分类失败:', error);
      this.showErrorMessage('网络错误，请重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载二级分类
  async loadSecondaryCategories() {
    // 重置数据
    this.setData({
      secondaryCategories: [],
      currentSecondary: null,
      currentQuestions: [],
      showSecondarySidebar: false
    });
    
    if (!this.data.currentPrimary) return;
    
    try {
      const categoryParams = new CategoryParams(null, this.data.currentPrimary)
      categoryParams.sortField = 'sort_order'
      categoryParams.order = 'asc'
      const response = await authApi.getCategories(categoryParams);
      console.log('二级分类：：', response);
      
      if (response.code === "0000" && response.data) {
        const secondaryCategories = response.data.rows;
        const hasSecondaryCategories = secondaryCategories && secondaryCategories.length > 0;
        
        this.setData({
          secondaryCategories: secondaryCategories,
          currentSecondary: hasSecondaryCategories ? secondaryCategories[0]?.id : null,
          showSecondarySidebar: hasSecondaryCategories
        });
        
        // 重置分页
        this.resetPagination();
        
        // 如果有二级分类，加载对应的问题
        if (this.data.currentSecondary) {
          await this.loadQuestions();
        }
      } else {
        this.setData({
          secondaryCategories: [],
          currentSecondary: null,
          currentQuestions: [],
          showSecondarySidebar: false
        });
      }
    } catch (error) {
      console.error('加载二级分类失败:', error);
      this.showErrorMessage('加载分类失败');
      this.setData({
        secondaryCategories: [],
        currentSecondary: null,
        currentQuestions: [],
        showSecondarySidebar: false
      });
    }
  },

  // 加载问题数据 - 支持分页
  async loadQuestions() {
    if (!this.data.currentSecondary) {
      this.setData({ currentQuestions: [] });
      return;
    }
    
    // 如果没有更多数据，直接返回
    if (!this.data.hasMore && this.data.page > 1) {
      return;
    }
    
    try {
      const questionParams = new QuestionParams(null, this.data.currentSecondary, null)
      questionParams.sortField = 'id'
      questionParams.order = 'asc'
      questionParams.page = this.data.page
      questionParams.limit = this.data.pageSize
      
      const response = await authApi.getQuestions(questionParams);
      console.log('问题列表：：', response);

      if (response.code === "0000" && response.data) {
        const newQuestions = response.data.rows || [];
        const total = response.data.total || 0;
        
        // 如果是第一页，直接替换数据；否则追加数据
        const currentQuestions = this.data.page === 1 
          ? newQuestions 
          : [...this.data.currentQuestions, ...newQuestions];
        
        // 计算是否还有更多数据
        const hasMore = currentQuestions.length < total;
        
        this.setData({
          currentQuestions: currentQuestions,
          total: total,
          hasMore: hasMore,
          isLoadingMore: false
        });
        
        console.log(`第${this.data.page}页加载完成，共${currentQuestions.length}条，总计${total}条，还有更多: ${hasMore}`);
      } else {
        this.setData({
          isLoadingMore: false
        });
      }
    } catch (error) {
      console.error('加载问题失败:', error);
      this.showErrorMessage('加载内容失败');
      this.setData({
        isLoadingMore: false
      });
    }
  },

  // 加载更多数据
  async loadMoreQuestions() {
    if (this.data.isLoadingMore || !this.data.hasMore) {
      return;
    }
    
    this.setData({
      isLoadingMore: true
    });
    
    // 页码加1
    const nextPage = this.data.page + 1;
    
    this.setData({
      page: nextPage
    });
    
    await this.loadQuestions();
  },

  // Tabs 切换事件
  async onTabChange(e) {
    const categoryId = parseInt(e.detail.value);
    
    // 重置数据
    this.setData({
      currentPrimary: categoryId,
      secondaryCategories: [],
      currentSecondary: null,
      currentQuestions: [],
      showSecondarySidebar: false
    });
    
    await this.loadSecondaryCategories();
    this.autoScrollToCurrent();
  },

  // 计算导航栏高度
  calculateNavBarHeight() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    
    const navBarHeight = (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 + menuButtonInfo.height;
    
    const messageOffset = navBarHeight + 60;
    console.log('messageOffset:', messageOffset);
    this.setData({
      navBarHeight: navBarHeight,
      messageOffset: messageOffset
    });
    
    wx.setStorageSync('navBarHeight', navBarHeight + 'rpx');
    wx.setStorageSync('statusBarHeight', systemInfo.statusBarHeight + 'px');
  },

  // 显示错误消息的统一方法
  showErrorMessage(content) {
    Message.error({
      content: content,
      offset: [this.data.messageOffset, 16],
      duration: 3000
    });
  },

  // 显示成功消息的统一方法
  showSuccessMessage(content) {
    Message.success({
      content: content,
      offset: [this.data.messageOffset, 16],
      duration: 2000
    });
  },

  // 切换一级分类
  async switchPrimaryCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    
    // 重置数据
    this.setData({
      currentPrimary: categoryId,
      secondaryCategories: [],
      currentSecondary: null,
      currentQuestions: [],
      showSecondarySidebar: false
    });
    
    await this.loadSecondaryCategories();
    this.autoScrollToCurrent();
  },

  // 自动滚动到当前选中的分类
  autoScrollToCurrent() {
    this.setData({ scrollLeft: 0 });
    
    setTimeout(() => {
      const query = wx.createSelectorQuery();
      query.select('.category-item.active').boundingClientRect();
      query.select('.categories-scroll').boundingClientRect();
      query.exec((res) => {
        if (res[0] && res[1]) {
          const activeItem = res[0];
          const scrollView = res[1];
          const scrollLeft = activeItem.left - scrollView.left + (activeItem.width - scrollView.width) / 2;
          
          this.setData({
            scrollLeft: Math.max(0, scrollLeft)
          });
        }
      });
    }, 100);
  },

  // 切换二级分类
  async switchSecondaryCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    
    // 重置分页
    this.resetPagination();
    
    this.setData({
      currentSecondary: categoryId
    });
    
    await this.loadQuestions();
  },

  // 切换侧边栏收起状态
  toggleSidebar() {
    this.setData({
      isSidebarCollapsed: !this.data.isSidebarCollapsed
    });
  },

  // 图片预览
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    const images = this.data.currentQuestions.map(item => item.url);
    
    wx.previewImage({
      urls: images,
      current: url
    });
  },

  // 下拉刷新
  async onRefresh() {
    try {
      // 重置分页
      this.resetPagination();
      await this.loadQuestions();
      this.showSuccessMessage('刷新成功');
    } catch (error) {
      this.showErrorMessage('刷新失败');
    } finally {
      this.setData({ enable: false });
    }
  },

  // 页面滚动事件 - 实现滚动到底部加载更多
  onPageScroll(e) {
    this.setData({
      scrollTop: e.scrollTop
    });
    
    // 防抖处理，避免频繁触发
    if (this.data.isScrolling) return;
    
    this.setData({
      isScrolling: true
    });
    
    setTimeout(() => {
      this.setData({
        isScrolling: false
      });
    }, 300);
  },

  // 监听页面滚动到底部
  onReachBottom() {
    console.log('滚动到底部，触发加载更多');
    this.loadMoreQuestions();
  },

  // 发布
  goRelease() {
    wx.navigateTo({
      url: '/pages/release/release'
    });
  },

  // 点击问题
  onQuestionClick(e) {
    const categoryId = e.currentTarget.dataset.id;
    const category = this.data.currentQuestions.find(item => item.id === categoryId);
    
    console.log('点击问题:', category);
    
    wx.navigateTo({
      url: `/pages/question/index?categoryId=${categoryId}&categoryName=${category.name}`
    });
  },

  onReleaseTap: function() {
    console.log('在这里调用 app.js 中的方法')
    // 在这里调用 app.js 中的方法
    // 跳转到问题详情页面
    app.navigateToLogin({
      url: `/pages/publish/index`,
      fail: function(res) {
        console.log('跳转失败', res)
      }
    });
  },

  // 监听页面滚动到底部（备选方案）
  onScrollToLower() {
    console.log('滚动到底部');
    this.loadMoreQuestions();
  }
});