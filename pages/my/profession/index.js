import { handleApiError } from '~/api/index';
import useToastBehavior from '~/behaviors/useToast';
import { fetchPersonalInfo, savePersonalInfo } from '~/utils/userProfile';
import { fetchProfessionOptions, formatProfessionText } from '~/utils/profession';
import {
  backPage,
  isTabPage,
  redirectPage,
  switchTabPage,
} from '~/utils/router';

Page({
  behaviors: [useToastBehavior],

  data: {
    loading: true,
    saving: false,
    fromLogin: false,
    returnUrl: '',
    options: [],
    selected: [],
    selectedMap: {},
    selectedLabels: [],
    summaryText: '尚未选择职业方向',
    selectedCount: 0
  },

  onLoad(options) {
    let returnUrl = options.return || '';
    if (returnUrl && returnUrl.includes('%')) {
      try {
        returnUrl = decodeURIComponent(returnUrl);
      } catch (e) {
        // keep
      }
    }
    this.setData({
      fromLogin: options.from === 'login',
      returnUrl
    });
    this.bootstrap();
  },

  onPullDownRefresh() {
    return this.bootstrap();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [info, options] = await Promise.all([
        fetchPersonalInfo(),
        fetchProfessionOptions(true)
      ]);
      const selected = Array.isArray(info.professionCodes) ? [...info.professionCodes] : [];
      this.applySelected(selected, options);
    } catch (error) {
      console.error('[profession] 初始化失败', error);
      handleApiError(error, { fallbackMessage: '加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  applySelected(selected, options) {
    const optionList = options || this.data.options;
    const selectedMap = selected.reduce((map, code) => {
      map[code] = true;
      return map;
    }, {});
    const selectedLabels = selected
      .map((code) => optionList.find((item) => item.code === code))
      .filter(Boolean)
      .map((item) => item.label);
    this.setData({
      options: optionList,
      selected,
      selectedMap,
      selectedLabels,
      selectedCount: selected.length,
      summaryText: selected.length
        ? formatProfessionText(selected, optionList)
        : '选择你正在准备或从事的方向，我们将推荐更匹配的题库'
    });
  },

  onToggle(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) {
      return;
    }
    const selected = [...this.data.selected];
    const index = selected.indexOf(code);
    if (index >= 0) {
      selected.splice(index, 1);
    } else {
      selected.push(code);
    }
    this.applySelected(selected);
  },

  onClearAll() {
    if (!this.data.selected.length) {
      return;
    }
    this.applySelected([]);
  },

  async onSave() {
    if (this.data.saving) {
      return;
    }
    if (!this.data.selected.length) {
      this.onShowToast('#t-toast', '请至少选择一个职业方向');
      return;
    }
    this.setData({ saving: true });
    try {
      await savePersonalInfo({ professionCodes: this.data.selected });
      this.onShowToast('#t-toast', '职业方向已更新');
      setTimeout(() => this.finishNavigate(), 500);
    } catch (error) {
      console.error('[profession] 保存失败', error);
      handleApiError(error, { fallbackMessage: '保存失败' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onSkip() {
    if (!this.data.fromLogin) {
      backPage();
      return;
    }
    this.finishNavigate();
  },

  finishNavigate() {
    const { fromLogin, returnUrl } = this.data;
    if (!fromLogin) {
      backPage();
      return;
    }
    if (returnUrl) {
      let openUrl = returnUrl;
      if (openUrl.includes('%')) {
        try {
          openUrl = decodeURIComponent(openUrl);
        } catch (e) {
          // keep
        }
      }
      if (!openUrl.startsWith('/')) {
        openUrl = `/${openUrl}`;
      }
      if (isTabPage(openUrl)) {
        switchTabPage({ url: openUrl });
        return;
      }
      redirectPage({
        url: openUrl,
        fail: () => switchTabPage({ url: '/pages/my/index' })
      });
      return;
    }
    switchTabPage({ url: '/pages/my/index' });
  }
});
