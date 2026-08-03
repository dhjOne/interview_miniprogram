import { aiApi, unwrapData } from '~/api/index';
import useToastBehavior from '~/behaviors/useToast';
import mknowChatBehavior from './behaviors/chat';
import mknowHistoryBehavior from './behaviors/history';
import { AppEvents } from '~/utils/eventBus';
import { openPage } from '~/utils/router';
import {
  DEFAULT_MODEL_OPTIONS,
  filterModelOptions,
  getNavContentHeight,
  getStoredModelKey,
  groupModelOptions,
  hasLoginToken,
  normalizeMknowQuota,
  normalizeModelOptions,
  saveStoredModelKey,
} from '~/utils/mknowHelpers';

const app = getApp();

const EMPTY_QUOTA = normalizeMknowQuota(null);

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
    showAiQuota: false,
    aiQuota: EMPTY_QUOTA,
    showQuotaDetail: false,
    showQuotaExhaustedDialog: false,
    refreshing: false,
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
    this._bindPointsChanged();
    // 模型列表只在 onLoad / 下拉刷新拉；onShow 只刷新配额，避免首进双刷
    this.loadAiQuota();
  },

  onHide() {
    this._unbindPointsChanged();
    // 离开页面时取消进行中的流式请求，避免后台继续生成/扣次
    if (typeof this.abortActiveStream === 'function') {
      this.abortActiveStream();
    }
  },

  onUnload() {
    this._unbindPointsChanged();
    if (typeof this.abortActiveStream === 'function') {
      this.abortActiveStream();
    }
  },

  async onScrollRefresh() {
    this.setData({ refreshing: true });
    try {
      await Promise.all([
        this.initModelSelector(),
        this.loadAiQuota(),
        this.refreshConversationState(),
        this.refreshHistoryList({ fetchRemote: true }),
      ]);
    } finally {
      this.setData({ refreshing: false });
    }
  },

  _bindPointsChanged() {
    if (this._onPointsChanged) return;
    this._onPointsChanged = () => {
      this.loadAiQuota();
    };
    if (app.eventBus && typeof app.eventBus.on === 'function') {
      app.eventBus.on(AppEvents.POINTS_CHANGED, this._onPointsChanged);
    }
  },

  _unbindPointsChanged() {
    if (!this._onPointsChanged) return;
    if (app.eventBus && typeof app.eventBus.off === 'function') {
      app.eventBus.off(AppEvents.POINTS_CHANGED, this._onPointsChanged);
    }
    this._onPointsChanged = null;
  },

  async loadAiQuota() {
    if (!hasLoginToken()) {
      this.setData({
        showAiQuota: false,
        aiQuota: EMPTY_QUOTA,
        showQuotaDetail: false,
      });
      return;
    }
    try {
      const res = await aiApi.getQuota();
      const aiQuota = normalizeMknowQuota(unwrapData(res) || res);
      this.setData({ aiQuota, showAiQuota: true });
    } catch (e) {
      console.warn('[mknow] ai quota load failed', e);
    }
  },

  onOpenQuotaDetail() {
    if (!this.data.showAiQuota) return;
    this.setData({ showQuotaDetail: true });
  },

  onCloseQuotaDetail(e) {
    if (e && e.detail && e.detail.visible) return;
    this.setData({ showQuotaDetail: false });
  },

  onGoRedeem() {
    this.setData({
      showQuotaDetail: false,
      showQuotaExhaustedDialog: false,
    });
    openPage({
      url: '/pages/ucenter/points/redeem/index',
      fail: () => {
        this.onShowToast('#t-toast', '无法打开兑换页');
      },
    });
  },

  showQuotaExhaustedGuide() {
    this.setData({ showQuotaExhaustedDialog: true });
  },

  onQuotaExhaustedConfirm() {
    this.setData({ showQuotaExhaustedDialog: false });
    this.onGoRedeem();
  },

  onQuotaExhaustedCancel() {
    this.setData({ showQuotaExhaustedDialog: false });
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
