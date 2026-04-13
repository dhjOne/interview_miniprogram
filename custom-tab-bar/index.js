const app = getApp();

Component({
  data: {
    value: '', // 初始值设置为空，避免第一次加载时闪烁
    unreadNum: 0, // 未读消息数量
    list: [
      {
        icon: 'book-open',
        value: 'category',
        label: '题库',
      },
      {
        icon: 'upload',
        value: 'release',
        label: '发布',
      },
      {
        icon: 'user',
        value: 'my',
        label: '我的',
      },
    ],
  },
  lifetimes: {
    ready() {
      this.syncValueFromRoute();

      // 同步全局未读消息数量
      this.setUnreadNum(app.globalData.unreadNum);
      app.eventBus.on('unread-num-change', (unreadNum) => {
        this.setUnreadNum(unreadNum);
      });
    },
  },

  /** 宿主 Tab 页每次显示时同步高亮，避免从登录等页 reLaunch/switchTab 后仍停在「题库」态 */
  pageLifetimes: {
    show() {
      this.syncValueFromRoute();
    },
  },
  methods: {
    syncValueFromRoute() {
      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      if (!curPage || !curPage.route) return;
      const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
      if (!nameRe || !nameRe[1]) return;
      const name = nameRe[1];
      const allowed = ['category', 'release', 'my', 'home', 'message'];
      if (!allowed.includes(name)) return;
      if (name !== this.data.value) {
        this.setData({ value: name });
      }
    },

    handleChange(e) {
      const { value } = e.detail;
      wx.switchTab({ url: `/pages/${value}/index` });
    },

    /** 设置未读消息数量 */
    setUnreadNum(unreadNum) {
      this.setData({ unreadNum });
    },
  },
});
