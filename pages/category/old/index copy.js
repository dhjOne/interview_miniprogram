import Message from 'tdesign-miniprogram/message';
import { authApi } from '~/api/request/api_category';
import { CategoryParams } from '~/api/param/param_category'
import { QuestionParams } from '~/api/param/param_category'

const app = getApp();

Page({
  data: {
    isSidebarCollapsed: false,
    currentPrimary: null, // 初始为null，等接口返回后设置
    currentSecondary: null,
    scrollLeft: 0,
    primaryCategories: [], // 初始为空数组
    secondaryCategories: [],
    currentQuestions: [],
    navBarHeight: 90,
    enable: false,
    loading: false, // 添加加载状态
    lastRefreshTime: 0, // 最后刷新时间戳
    needRefresh: false  // 是否需要刷新
  },

  onLoad() {
    console.log('页面加载开始');
    this.calculateNavBarHeight();
    this.loadPrimaryCategories(); // 改为加载一级分类

    // 注册全局刷新事件
    app.on('refreshQuestionBank', this.handleRefresh.bind(this));
  },

  onUnload() {
    // 页面卸载时移除事件监听
    app.off('refreshQuestionBank', this.handleRefresh);
  },

  // 处理刷新事件
  handleRefresh() {
    console.log('收到刷新指令');
    this.setData({ needRefresh: true });
    
    if (this.data.currentPrimary) {
      this.refreshCurrentData();
    }
  },

  onShow() {
    console.log('页面显示');
    // 如果超过一定时间（比如5分钟）或者标记需要刷新，则刷新数据
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
    // 记录页面隐藏时间
    this.setData({
      lastRefreshTime: Date.now()
    });
  },
  
  // 刷新当前数据的统一方法
  async refreshCurrentData() {
    console.log('刷新当前页面数据');
    
    try {
      this.setData({ loading: true });
      
      // 重新加载当前分类的数据
      await this.loadSecondaryCategories();
      
      // 如果当前有选中的二级分类，也刷新图片
      if (this.data.currentSecondary) {
        await this.loadQuestions();
      }
      Message.success('数据已更新');
    } catch (error) {
      console.error('刷新数据失败:', error);
      Message.error('刷新失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载一级分类
  async loadPrimaryCategories() {
    try {
      this.setData({ loading: true });
      console.log('开始加载数据')
      // 调用获取一级分类的接口
      const categoryParams = new CategoryParams(null, 0)
      const response = await authApi.getCategories(categoryParams);
      console.log('一级分类：：', response);
      if (response.code === "0000" && response.data) {
        const primaryCategories = response.data.rows;
        
        this.setData({
          primaryCategories: primaryCategories,
          currentPrimary: primaryCategories[0]?.id || null
        });
        
        // 加载第一个一级分类对应的二级分类
        if (this.data.currentPrimary) {
          await this.loadSecondaryCategories();
        }
      } else {
        Message.error('获取分类失败');
      }
    } catch (error) {
      console.error('加载一级分类失败:', error);
      Message.error('网络错误，请重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载二级分类
  async loadSecondaryCategories() {
    if (!this.data.currentPrimary) return;
    
    try {
      // 调用获取二级分类的接口
      const categoryParams = new CategoryParams(null, this.data.currentPrimary)
      const response = await authApi.getCategories(categoryParams);
      console.log('二级分类：：', response);
      
      if (response.code === "0000" && response.data) {
        const secondaryCategories = response.data.rows;
        
        this.setData({
          secondaryCategories: secondaryCategories,
          currentSecondary: secondaryCategories[0]?.id || null
        });
        
        // 加载第一个二级分类对应的图片
        if (this.data.currentSecondary) {
          await this.loadQuestions();
        }
      }
    } catch (error) {
      console.error('加载二级分类失败:', error);
      Message.error('加载分类失败');
    }
  },

  // 加载图片数据
  async loadQuestions() {
    if (!this.data.currentSecondary) return;
    
    try {
      // 调用获取图片的接口
      const questionParams = new QuestionParams(null, this.data.currentSecondary, null)
      const response = await authApi.getQuestions(questionParams);
      console.log('问题列表：：', response);
  
      if (response.code === "0000" && response.data) {
        this.setData({
          currentQuestions: response.data.rows
        });
      }
    } catch (error) {
      console.error('加载问题失败:', error);
      Message.error('加载内容失败');
    }
  },

  // Tabs 切换事件
  async onTabChange(e) {
    const categoryId = parseInt(e.detail.value);
    this.setData({
      currentPrimary: categoryId
    });
    
    // 重新加载二级分类和图片
    await this.loadSecondaryCategories();
    this.autoScrollToCurrent();
  },

  // 计算导航栏高度
  calculateNavBarHeight() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    
    const navBarHeight = (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 + menuButtonInfo.height;
    
    this.setData({
      navBarHeight: navBarHeight
    });
    
    wx.setStorageSync('navBarHeight', navBarHeight + 'rpx');
    wx.setStorageSync('statusBarHeight', systemInfo.statusBarHeight + 'px');
  },

  // 切换一级分类（点击横向导航时）
  async switchPrimaryCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    this.setData({
      currentPrimary: categoryId
    });
    
    await this.loadSecondaryCategories();
    this.autoScrollToCurrent();
  },

  // 自动滚动到当前选中的分类
  autoScrollToCurrent() {
    this.setData({ scrollLeft: 0 }); // 重置滚动位置
    
    // 使用延时确保DOM更新完成
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
      // 重新加载当前数据
      await this.loadQuestions();
      Message.success('刷新成功');
    } catch (error) {
      Message.error('刷新失败');
    } finally {
      this.setData({ enable: false });
    }
  },

  // 发布
  goRelease() {
    // 发布逻辑
    wx.navigateTo({
      url: '/pages/release/release'
    });
  }
});