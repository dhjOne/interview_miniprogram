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
    showSecondarySidebar: true, // 新增：控制二级侧边栏显示
    messageOffset: 100 
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
                        (now - this.data.lastRefreshTime > 5 * 60 ) ||
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
        await this.loadQuestions();
      }
      this.showSuccessMessage('数据已更新');
    } catch (error) {
      console.error('刷新数据失败:', error);
      this.showSuccessMessage('刷新失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载一级分类
  async loadPrimaryCategories() {
    try {
      this.setData({ loading: true });
      console.log('开始加载数据')
      const categoryParams = new CategoryParams(null, 0)
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
      // 统一错误处理
      if (error instanceof BusinessError) {
        // 业务错误
        this.showErrorMessage(error.message || '请求失败');
        // 可以根据错误码进行特殊处理
        if (error.code === 401) {
          // token过期，已经在请求层处理了，这里可以补充逻辑
          console.log('token过期');
        }
      } else {
        // 其他错误
      
        this.showErrorMessage('网络错误，请重试');
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载二级分类 - 关键修改
  async loadSecondaryCategories() {
    // 先重置数据
    this.setData({
      secondaryCategories: [],
      currentSecondary: null,
      currentQuestions: [],
      showSecondarySidebar: false // 默认隐藏侧边栏
    });
    
    if (!this.data.currentPrimary) return;
    
    try {
      const categoryParams = new CategoryParams(null, this.data.currentPrimary)
      const response = await authApi.getCategories(categoryParams);
      console.log('二级分类：：', response);
      
      if (response.code === "0000" && response.data) {
        const secondaryCategories = response.data.rows;
        
        // 判断是否有二级分类数据
        const hasSecondaryCategories = secondaryCategories && secondaryCategories.length > 0;
        
        this.setData({
          secondaryCategories: secondaryCategories,
          currentSecondary: hasSecondaryCategories ? secondaryCategories[0]?.id : null,
          showSecondarySidebar: hasSecondaryCategories // 有数据才显示侧边栏
        });
        
        // 如果有二级分类，加载对应的问题
        if (this.data.currentSecondary) {
          await this.loadQuestions();
        } else {
          this.setData({ currentQuestions: [] });
        }
      } else {
        // 接口返回失败，确保数据为空
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

  // 加载问题数据
  async loadQuestions() {
    if (!this.data.currentSecondary) {
      this.setData({ currentQuestions: [] });
      return;
    }
    
    try {
      const questionParams = new QuestionParams(null, this.data.currentSecondary, null)
      const response = await authApi.getQuestions(questionParams);
      console.log('问题列表：：', response);
  
      if (response.code === "0000" && response.data) {
        this.setData({
          currentQuestions: response.data.rows
        });
      } else {
        this.setData({ currentQuestions: [] });
      }
    } catch (error) {
      console.error('加载问题失败:', error);
      this.showErrorMessage('加载内容失败');
      this.setData({ currentQuestions: [] });
    }
  },

  // Tabs 切换事件
  async onTabChange(e) {
    const categoryId = parseInt(e.detail.value);
    
    // 立即重置数据
    this.setData({
      currentPrimary: categoryId,
      secondaryCategories: [],
      currentSecondary: null,
      currentQuestions: [],
      showSecondarySidebar: false // 切换时先隐藏侧边栏
    });
    
    await this.loadSecondaryCategories();
    this.autoScrollToCurrent();
  },

  // 计算导航栏高度
  calculateNavBarHeight() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    
    const navBarHeight = (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 + menuButtonInfo.height;
    
    // 计算消息偏移量，确保在导航栏下方
    const messageOffset = navBarHeight + 60; // 导航栏高度 + 安全间距
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
      offset: [this.data.messageOffset, 16], // 使用计算出的偏移量
      duration: 3000
    });
  },

  // 显示成功消息的统一方法
  showSuccessMessage(content) {
    console.log('messageOffset', this.data.messageOffset)
    Message.success({
      content: content,
      offset: [this.data.messageOffset, 16],
      duration: 2000
    });
  },

  // 切换一级分类（点击横向导航时）
  async switchPrimaryCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    
    // 立即重置数据
    this.setData({
      currentPrimary: categoryId,
      secondaryCategories: [],
      currentSecondary: null,
      currentQuestions: [],
      showSecondarySidebar: false // 切换时先隐藏侧边栏
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
      await this.loadQuestions();
      this.showSuccessMessage('刷新成功');
    } catch (error) {
      this.showErrorMessage('刷新失败');
    } finally {
      this.setData({ enable: false });
    }
  },

  // 发布
  goRelease() {
    wx.navigateTo({
      url: '/pages/release/release'
    });
  },


  // 在页面 JS 中添加点击问题的方法
  onQuestionClick(e) {
    const categoryId = e.currentTarget.dataset.id;
    const category = this.data.currentQuestions.find(item => item.id === categoryId);
    
    console.log('点击问题:', category);
    
    // 这里可以跳转到问题详情页
    wx.navigateTo({
      url: `/pages/question/index?categoryId=${categoryId}&categoryName=${category.name}`
    });
    
    // 或者显示问题详情弹窗
    // this.showQuestionDetail(question);
  },

});