import Message from 'tdesign-miniprogram/message/index';
import request from '~/api/request';
import { authApi } from '~/api/request/api_login';

const app = getApp();

Page({
  data: {
    isSidebarCollapsed: false,
    currentPrimary: 1,
    currentSecondary: 101,
    scrollLeft: 0,
    primaryCategories: [
      { id: 1, name: '算法', count: '7 ~ 1 ~ 110' },
      { id: 2, name: '后端', count: '13 ~ 2 ~ 110' },
      { id: 3, name: '前端', count: '38%' }
    ],
    secondaryCategories: [],
    allSecondaryCategories: {
      1: [
        { id: 101, name: 'Vue', icon: 'app', count: '23' },
        { id: 102, name: 'React', icon: 'app', count: '15' },
        { id: 103, name: 'Css', icon: 'app', count: '32' },
        { id: 104, name: 'Html', icon: 'app', count: '18' }
      ],
      2: [
        { id: 201, name: 'Java', icon: 'server', count: '45' },
        { id: 202, name: 'Python', icon: 'server', count: '38' },
        { id: 203, name: 'Go', icon: 'server', count: '22' }
      ],
      3: [
        { id: 301, name: 'JavaScript', icon: 'code', count: '56' },
        { id: 302, name: 'TypeScript', icon: 'code', count: '34' },
        { id: 303, name: '小程序', icon: 'code', count: '28' }
      ]
    },
    currentImages: [],
    navBarHeight: 90,
    enable: false // 下拉刷新状态
  },

  onLoad() {
    this.calculateNavBarHeight();
    this.loadSecondaryCategories();
    this.loadImages();
    this.autoScrollToCurrent();
  },

  // Tabs 切换事件
  onTabChange(e) {
    const categoryId = parseInt(e.detail.value);
    this.setData({
      currentPrimary: categoryId,
      currentSecondary: this.data.allSecondaryCategories[categoryId][0].id
    });
    this.loadSecondaryCategories();
    this.loadImages();
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
  switchPrimaryCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    this.setData({
      currentPrimary: categoryId,
      currentSecondary: this.data.allSecondaryCategories[categoryId][0].id
    });
    this.loadSecondaryCategories();
    this.loadImages();
    this.autoScrollToCurrent();
  },

  // 自动滚动到当前选中的分类
  autoScrollToCurrent() {
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
  },

  // 切换二级分类
  switchSecondaryCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    this.setData({
      currentSecondary: categoryId
    });
    this.loadImages();
  },

  // 加载二级分类
  loadSecondaryCategories() {
    const categories = this.data.allSecondaryCategories[this.data.currentPrimary];
    this.setData({
      secondaryCategories: categories
    });
  },

  // 加载图片数据
  loadImages() {
    const mockImages = {
      101: [
        { id: 1, url: '/images/vue1.jpg', title: 'Vue基础教程', description: '掌握Vue核心概念' },
        { id: 2, url: '/images/vue2.jpg', title: 'Vue实战项目', description: '企业级项目开发' }
      ],
      102: [
        { id: 3, url: '/images/react1.jpg', title: 'React Hooks', description: '现代化React开发' },
        { id: 4, url: '/images/react2.jpg', title: 'Redux状态管理', description: '复杂状态管理方案' }
      ]
    };

    const images = mockImages[this.data.currentSecondary] || [];
    this.setData({
      currentImages: images
    });
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
    wx.previewImage({
      urls: [url],
      current: url
    });
  },

  // 下拉刷新
  onRefresh() {
    setTimeout(() => {
      this.loadImages();
      this.setData({ enable: false });
      Message.success('刷新成功');
    }, 1000);
  },

  // 发布
  goRelease() {
    // 发布逻辑
  }
});