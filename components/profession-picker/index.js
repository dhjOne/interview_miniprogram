import { handleApiError } from '~/api/index';
import { fetchProfessionOptions } from '~/utils/profession';

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    value: {
      type: Array,
      value: []
    },
    showSkip: {
      type: Boolean,
      value: false
    },
    saving: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '选择你的职业方向'
    },
    subtitle: {
      type: String,
      value: '可多选，我们将据此推荐更匹配的题库分类'
    }
  },

  data: {
    options: [],
    selected: [],
    selectedMap: {},
    loading: false
  },

  observers: {
    visible(visible) {
      if (visible) {
        this.syncSelected(this.properties.value);
        this.ensureOptions();
      }
    },
    value(codes) {
      if (this.properties.visible) {
        this.syncSelected(codes);
      }
    }
  },

  lifetimes: {
    attached() {
      this.ensureOptions();
    }
  },

  methods: {
    async ensureOptions() {
      if (this.data.options.length) {
        return;
      }
      this.setData({ loading: true });
      try {
        const options = await fetchProfessionOptions();
        this.setData({ options });
      } catch (error) {
        console.error('[profession-picker] 加载职业选项失败', error);
        handleApiError(error, { fallbackMessage: '职业选项加载失败' });
      } finally {
        this.setData({ loading: false });
      }
    },

    syncSelected(codes) {
      const selected = Array.isArray(codes) ? [...codes] : [];
      const selectedMap = selected.reduce((map, code) => {
        map[code] = true;
        return map;
      }, {});
      this.setData({ selected, selectedMap });
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
      const selectedMap = selected.reduce((map, item) => {
        map[item] = true;
        return map;
      }, {});
      this.setData({ selected, selectedMap });
    },

    onConfirm() {
      if (!this.data.selected.length) {
        wx.showToast({ title: '请至少选择一个职业', icon: 'none' });
        return;
      }
      this.triggerEvent('confirm', { professionCodes: this.data.selected });
    },

    onSkip() {
      this.triggerEvent('skip');
    },

    onVisibleChange(e) {
      const visible = e.detail.visible;
      if (!visible) {
        this.triggerEvent('close');
      }
    }
  }
});
