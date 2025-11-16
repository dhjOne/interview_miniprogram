import Message from 'tdesign-miniprogram/message/index';
import request from '~/api/request';
import { authApi } from '~/api/request/api_question';

const app = getApp();

Page({
  data: {
    isSidebarCollapsed: false,
    currentPrimary: null, // 初始为null，等接口返回后设置
    currentSecondary: null,
    scrollLeft: 0,
    primaryCategories: [], // 初始为空数组
    secondaryCategories: [],
    currentImages: [],
    navBarHeight: 90,
    enable: false,
    loading: true // 添加加载状态
  },

  onLoad() {
    this.calculateNavBarHeight();
    this.loadPrimaryCategories(); // 改为加载一级分类
  },

  // 加载一级分类
  async loadPrimaryCategories() {
    try {
      this.setData({ loading: true });
      
      // 调用获取一级分类的接口
      const response = await authApi.getCategories();
      console.log('一级分类：：', response);
      if (response.code === 200 && response.data) {
        const primaryCategories = response.data;
        
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
      const response = await request.get('/api/secondary-categories', {
        primaryId: this.data.currentPrimary
      });
      
      if (response.code === 200 && response.data) {
        const secondaryCategories = response.data;
        
        this.setData({
          secondaryCategories: secondaryCategories,
          currentSecondary: secondaryCategories[0]?.id || null
        });
        
        // 加载第一个二级分类对应的图片
        if (this.data.currentSecondary) {
          await this.loadImages();
        }
      }
    } catch (error) {
      console.error('加载二级分类失败:', error);
      Message.error('加载分类失败');
    }
  },

  // 加载图片数据
  async loadImages() {
    if (!this.data.currentSecondary) return;
    
    try {
      // 调用获取图片的接口
      const response = await request.get('/api/images', {
        secondaryId: this.data.currentSecondary
      });
      
      if (response.code === 200 && response.data) {
        this.setData({
          currentImages: response.data
        });
      }
    } catch (error) {
      console.error('加载图片失败:', error);
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
    
    await this.loadImages();
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
    const images = this.data.currentImages.map(item => item.url);
    
    wx.previewImage({
      urls: images,
      current: url
    });
  },

  // 下拉刷新
  async onRefresh() {
    try {
      // 重新加载当前数据
      await this.loadImages();
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