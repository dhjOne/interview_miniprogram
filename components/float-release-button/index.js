Component({
  properties: {
    // 自定义样式类
    customClass: {
      type: String,
      value: ''
    },
    // 自定义样式
    customStyle: {
      type: String,
      value: ''
    },
    // 按钮主题
    buttonTheme: {
      type: String,
      value: 'primary'
    },
    // 按钮大小
    buttonSize: {
      type: String,
      value: 'large'
    },
    // 按钮图标
    buttonIcon: {
      type: String,
      value: 'add'
    },
    // 按钮形状
    buttonShape: {
      type: String,
      value: 'round'
    },
    // 按钮文字
    buttonText: {
      type: String,
      value: '发布'
    },
    // 是否显示
    showButton: {
      type: Boolean,
      value: true
    },
    // 页面路径（可选，用于跳转）
    pagePath: {
      type: String,
      value: ''
    },
    // 跳转类型（navigateTo, redirectTo, switchTab, reLaunch）
    navigateType: {
      type: String,
      value: 'navigateTo'
    }
  },

  data: {
    // 这里可以放内部数据
  },

  methods: {
    // 按钮点击事件
    handleTap() {
      const { pagePath, navigateType } = this.properties;
      
      // 触发自定义事件，让父组件处理
      this.triggerEvent('onTap');
      
      // 如果有页面路径，则自动跳转
      if (pagePath) {
        this.navigateToPage();
      }
    },
    
    // 页面跳转方法
    navigateToPage() {
      const { pagePath, navigateType } = this.properties;
      
      if (!pagePath) return;
      
      // 根据跳转类型执行不同的跳转
      const navigatorMap = {
        navigateTo: wx.navigateTo,
        redirectTo: wx.redirectTo,
        switchTab: wx.switchTab,
        reLaunch: wx.reLaunch
      };
      
      const navigate = navigatorMap[navigateType] || wx.navigateTo;
      
      navigate({
        url: pagePath,
        fail: (err) => {
          console.error('跳转失败:', err);
          // 跳转失败时也触发事件
          this.triggerEvent('onError', { error: err });
        }
      });
    },
    
    // 外部可以调用的方法：显示按钮
    show() {
      this.setData({ showButton: true });
    },
    
    // 外部可以调用的方法：隐藏按钮
    hide() {
      this.setData({ showButton: false });
    }
  }
});