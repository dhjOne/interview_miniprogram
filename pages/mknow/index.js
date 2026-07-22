import { aiApi } from '~/api/index';
import useToastBehavior from '~/behaviors/useToast';
import mknowChatBehavior from './behaviors/chat';
import mknowHistoryBehavior from './behaviors/history';
import { fetchAiQuota } from '~/utils/points';
import {
  DEFAULT_MODEL_OPTIONS,
  filterModelOptions,
  getNavContentHeight,
  getStoredModelKey,
  groupModelOptions,
  hasLoginToken,
  normalizeModelOptions,
  saveStoredModelKey,
} from '~/utils/mknowHelpers';

/**
 * m知道
 * - behaviors/history：历史会话列表 / 切换 / 删除 / 新建
 * - behaviors/chat：发问、流式回复、导出、清空
 * - 本文件：模型选择、配额、生命周期
 */
Page({
  behaviors: [useToastBehavior, mknowHistoryBehavior, mknowChatBehavior],

  data: {
    popupNavBarHeight: 44,
    modelOptions: DEFAULT_MODEL_OPTIONS,
    modelGroups: groupModelOptions(DEFAULT_MODEL_OPTIONS),
    filteredModelOptions: DEFAULT_MODEL_OPTIONS,
    showModelPicker: false,
    modelSearchKeyword: '',
    selectedModelIndex: 0,
    selectedModelKey: 'auto',
    selectedModelName: 'Auto',
    aiQuotaList: [],
    showAiQuota: false,
  },

  onLoad() {
    this.setData({ popupNavBarHeight: getNavContentHeight() });
    this.initModelSelector();
    this.refreshConversationState();
    const { messages } = this.data;
    if (messages.length) {
      wx.nextTick(() => this.scrollToBottom());
    }
  },

  onShow() {
    this.initModelSelector();
    this.loadAiQuota();
  },

  onPullDownRefresh() {
    return Promise.all([
      this.initModelSelector(),
      this.loadAiQuota(),
      this.refreshConversationState(),
      this.refreshHistoryList({ fetchRemote: true }),
    ]);
  },

  async loadAiQuota() {
    if (!hasLoginToken()) {
      this.setData({ aiQuotaList: [], showAiQuota: false });
      return;
    }
    try {
      const aiQuotaList = await fetchAiQuota();
      const showAiQuota = aiQuotaList.some((item) => item.remaining > 0);
      this.setData({ aiQuotaList, showAiQuota });
    } catch (e) {
      console.warn('[mknow] ai quota load failed', e);
    }
  },

  async initModelSelector() {
    const selectedModelKey = getStoredModelKey();
    this.applyModelOptions(DEFAULT_MODEL_OPTIONS, selectedModelKey);
    if (!hasLoginToken()) return;
    try {
      const res = await aiApi.listModels();
      this.applyModelOptions(normalizeModelOptions(res), selectedModelKey);
    } catch (err) {
      console.warn('[mknow] load models failed', err);
    }
  },

  applyModelOptions(modelOptions, selectedModelKey = 'auto') {
    const options = modelOptions && modelOptions.length ? modelOptions : DEFAULT_MODEL_OPTIONS;
    const selectedModelIndex = Math.max(
      0,
      options.findIndex((item) => item.key === selectedModelKey),
    );
    const selected = options[selectedModelIndex] || options[0];
    this.setData({
      modelOptions: options,
      modelGroups: groupModelOptions(options),
      filteredModelOptions: options,
      modelSearchKeyword: '',
      selectedModelIndex,
      selectedModelKey: selected.key,
      selectedModelName: selected.label,
    });
  },

  onOpenModelPicker() {
    if (this.data.sending) {
      this.onShowToast('#t-toast', '请等待当前回复完成');
      return;
    }
    this.setData({
      showModelPicker: true,
      modelSearchKeyword: '',
      filteredModelOptions: this.data.modelOptions,
      modelGroups: groupModelOptions(this.data.modelOptions),
    });
  },

  onCloseModelPicker(e) {
    if (e && e.detail && e.detail.visible) {
      return;
    }
    this.setData({ showModelPicker: false, modelSearchKeyword: '' });
  },

  onModelSearch(e) {
    const modelSearchKeyword = (e.detail.value || '').trim();
    const filteredModelOptions = filterModelOptions(this.data.modelOptions, modelSearchKeyword);
    this.setData({
      modelSearchKeyword,
      filteredModelOptions,
      modelGroups: groupModelOptions(filteredModelOptions),
    });
  },

  onSelectModel(e) {
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    const selected =
      this.data.modelOptions.find((item) => item.key === key) || DEFAULT_MODEL_OPTIONS[0];
    saveStoredModelKey(selected.key);
    this.setData({
      showModelPicker: false,
      modelSearchKeyword: '',
      selectedModelKey: selected.key,
      selectedModelName: selected.label,
      selectedModelIndex: Math.max(
        0,
        this.data.modelOptions.findIndex((item) => item.key === selected.key),
      ),
    });
    this.onShowToast('#t-toast', `已切换为 ${selected.label}`);
  },

  onModelChange(e) {
    if (this.data.sending) {
      this.onShowToast('#t-toast', '请等待当前回复完成');
      return;
    }
    const selectedModelIndex = Number(e.detail.value || 0);
    const selected = this.data.modelOptions[selectedModelIndex] || DEFAULT_MODEL_OPTIONS[0];
    saveStoredModelKey(selected.key);
    this.setData({
      selectedModelIndex,
      selectedModelKey: selected.key,
      selectedModelName: selected.label,
    });
    this.onShowToast('#t-toast', `已切换为 ${selected.label}`);
  },
});
