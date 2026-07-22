import { switchTabPage } from '~/utils/router';

Component({
  data: {
    value: '',
    list: [
      {
        icon: 'book-open',
        value: 'category',
        label: '题库',
      },
      {
        icon: 'chat-bubble',
        value: 'mknow',
        label: 'm知道',
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
      const allowed = ['category', 'mknow', 'my'];
      if (!allowed.includes(name)) return;
      if (name !== this.data.value) {
        this.setData({ value: name });
      }
    },

    handleChange(e) {
      const { value } = e.detail;
      switchTabPage({ url: `/pages/${value}/index` });
    },
  },
});
