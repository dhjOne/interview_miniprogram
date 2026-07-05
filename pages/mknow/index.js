import { aiApi } from '~/api/request/api_ai';
import useToastBehavior from '~/behaviors/useToast';
import { fetchAiQuota } from '~/utils/points';
import {
  clearMessages,
  createConversation,
  deleteConversation,
  getActiveConversationId,
  listConversations,
  loadMessages,
  mergeRemoteConversations,
  messagesToMarkdown,
  saveRemoteConversation,
  saveMessages,
  setPendingPublish,
  switchConversation,
} from '~/utils/aiChatStorage';

const app = getApp();
const { renderMarkdown: renderMarkdownAsync } = require('../../utils/towxmlLoader');

const SUGGESTIONS = [
  { id: 1, text: '帮我梳理一道二叉树的中序遍历思路', icon: 'chart-bubble' },
  { id: 2, text: 'Java 线程池有哪些核心参数？', icon: 'server' },
  { id: 3, text: '前端性能优化可以从哪几方面入手？', icon: 'logo-miniprogram' },
  { id: 4, text: '模拟一场 3 分钟的项目经历自我介绍', icon: 'user' },
];

const MODEL_KEY = 'mknow_selected_model_key';
const DEFAULT_MODEL_OPTIONS = [{ key: 'auto', label: 'Auto', provider: 'auto', auto: true }];

function createMessage(role, content, extra = {}) {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    time: Date.now(),
    ...extra,
  };
}

function hydrateMessages(messages = []) {
  return Promise.all(
    (messages || []).map(async (m) => {
      if (m.role !== 'assistant' || !m.content || m.renderedContent) return m;
      const renderedContent = await renderMarkdownAsync(m.content);
      return { ...m, renderedContent };
    }),
  );
}

function stripRendered(messages = []) {
  return messages.map(({ renderedContent, ...rest }) => rest);
}

function extractReplyText(res) {
  if (!res) return '';
  const data = res.data != null ? res.data : res;
  if (typeof data === 'string') return data;
  return (
    data.reply ||
    data.content ||
    data.answer ||
    data.message ||
    (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
    ''
  );
}

function extractSources(res) {
  const data = res && res.data != null ? res.data : res;
  return Array.isArray(data && data.sources) ? data.sources : [];
}

function extractErrorType(res) {
  const data = res && res.data != null ? res.data : res;
  return data && data.errorType ? data.errorType : '';
}

function hasLoginToken() {
  try {
    return !!wx.getStorageSync('access_token');
  } catch (e) {
    return false;
  }
}

function parseRemoteTime(value) {
  if (!value) return Date.now();
  if (typeof value === 'number') return value;
  const ts = Date.parse(String(value).replace(' ', 'T'));
  return Number.isNaN(ts) ? Date.now() : ts;
}

function pickRows(res) {
  const data = res && res.data != null ? res.data : res;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const nested = data.data;
  if (Array.isArray(nested)) return nested;
  return (
    data.rows ||
    data.list ||
    data.items ||
    data.records ||
    data.conversations ||
    []
  );
}

function normalizeRemoteConversations(res) {
  return pickRows(res).map((conv) => {
    const sessionId =
      conv.sessionId ||
      conv.session_id ||
      conv.conversationId ||
      conv.conversation_id ||
      String(conv.id || '');
    const conversationId =
      conv.conversationId || conv.conversation_id || sessionId;
    const messageCount =
      Number(conv.messageCount ?? conv.message_count ?? conv.msgCount ?? conv.msg_count) || 0;
    const previewText =
      conv.preview ||
      conv.lastMessage ||
      conv.last_message ||
      conv.summary ||
      '';
    return {
      id: conversationId || sessionId,
      conversationId,
      sessionId,
      title: conv.title || conv.name || '新对话',
      preview: previewText || (messageCount > 0 ? '点击查看历史消息' : '暂无消息'),
      updatedAt: parseRemoteTime(
        conv.updatedAt || conv.updated_at || conv.createdAt || conv.created_at,
      ),
      messageCount,
      remote: true,
    };
  });
}

async function normalizeRemoteMessages(res) {
  const rows = pickRows(res).filter((m) => m && m.content);
  return Promise.all(
    rows.map(async (m) =>
      createMessage(m.role === 'assistant' ? 'assistant' : 'user', m.content, {
        id: `remote_${m.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: parseRemoteTime(m.createdAt),
        renderedContent:
          m.role === 'assistant' ? await renderMarkdownAsync(m.content) : null,
      }),
    ),
  );
}

function normalizeModelOptions(res) {
  const data = res && res.data != null ? res.data : res;
  const list = Array.isArray(data) ? data : [];
  const merged = [...DEFAULT_MODEL_OPTIONS];
  list.forEach((item) => {
    if (!item || !item.key || merged.find((m) => m.key === item.key)) return;
    merged.push({
      key: item.key,
      label: item.label || item.key,
      provider: item.provider || '',
      description: item.description || '',
      auto: !!item.auto,
    });
  });
  return merged;
}

function groupModelOptions(modelOptions = []) {
  const providerLabels = {
    auto: '智能选择',
    ollama: '本地模型',
    openai: '云端模型',
  };
  const groups = [];
  const bucket = {};
  (modelOptions || []).forEach((item) => {
    const provider = item.provider || 'other';
    if (!bucket[provider]) bucket[provider] = [];
    bucket[provider].push(item);
  });
  Object.keys(bucket).forEach((provider) => {
    groups.push({
      key: provider,
      label: providerLabels[provider] || provider,
      items: bucket[provider],
    });
  });
  return groups;
}

function filterModelOptions(modelOptions = [], keyword = '') {
  const kw = (keyword || '').trim().toLowerCase();
  if (!kw) return modelOptions;
  return modelOptions.filter((item) => {
    const label = String(item.label || '').toLowerCase();
    const provider = String(item.provider || '').toLowerCase();
    const description = String(item.description || '').toLowerCase();
    const key = String(item.key || '').toLowerCase();
    return label.includes(kw) || provider.includes(kw) || description.includes(kw) || key.includes(kw);
  });
}

function getStoredModelKey() {
  try {
    return wx.getStorageSync(MODEL_KEY) || 'auto';
  } catch (e) {
    return 'auto';
  }
}

function saveStoredModelKey(modelKey) {
  try {
    wx.setStorageSync(MODEL_KEY, modelKey || 'auto');
  } catch (e) {
    // ignore
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupConversationsByTime(conversations) {
  const todayStart = startOfDay();
  const yesterdayStart = todayStart - DAY_MS;
  const weekStart = todayStart - 7 * DAY_MS;

  const buckets = [
    { key: 'today', label: '今天', items: [] },
    { key: 'yesterday', label: '昨天', items: [] },
    { key: 'week', label: '最近一周', items: [] },
    { key: 'earlier', label: '更早', items: [] },
  ];

  (conversations || []).forEach((conv) => {
    const ts = conv.updatedAt || 0;
    if (ts >= todayStart) buckets[0].items.push(conv);
    else if (ts >= yesterdayStart) buckets[1].items.push(conv);
    else if (ts >= weekStart) buckets[2].items.push(conv);
    else buckets[3].items.push(conv);
  });

  return buckets.filter((g) => g.items.length > 0);
}

function buildHistoryGroups(conversations, keyword, activeId) {
  const kw = (keyword || '').trim().toLowerCase();
  const list = (conversations || []).filter((c) => {
    if (c.messageCount > 0) return true;
    if (c.remote) return true;
    return c.id === activeId;
  });

  const filtered = kw
    ? list.filter(
        (c) =>
          String(c.title || '')
            .toLowerCase()
            .includes(kw) ||
          String(c.preview || '')
            .toLowerCase()
            .includes(kw),
      )
    : list;

  return groupConversationsByTime(filtered);
}

/** 与自定义导航栏内容区同高，供侧栏 popup 避让刘海/状态栏 */
function getNavContentHeight() {
  try {
    const sys = wx.getWindowInfo();
    const menu = wx.getMenuButtonBoundingClientRect();
    if (menu && menu.height) {
      return Math.max(44, (menu.top - sys.statusBarHeight) * 2 + menu.height);
    }
  } catch (e) {
    // ignore
  }
  return 44;
}

function buildFallbackReply(question) {
  return [
    '我是 m知道，你的面试 AI 助手。',
    '',
    '当前后端 AI 接口尚未接入或暂时不可用，以下为体验预览回答：',
    '',
    `你的问题：${question}`,
    '',
    '建议从「定义 → 核心要点 → 常见追问 → 项目结合」四步组织答案；若涉及算法，可先说明时间/空间复杂度，再给出关键步骤。',
    '',
    '接入 /ai/chat 后将返回真实模型回答。',
  ].join('\n');
}

Page({
  behaviors: [useToastBehavior],

  data: {
    suggestions: SUGGESTIONS,
    messages: [],
    input: '',
    sending: false,
    anchor: '',
    keyboardHeight: 0,
    streaming: false,
    sessionId: '',
    conversationId: '',
    chatTitle: '新对话',
    showHistory: false,
    conversations: [],
    historyGroups: [],
    historyKeyword: '',
    historySearchFocus: false,
    activeConversationId: '',
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
    showAiQuota: false
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
      this.refreshHistoryList({ fetchRemote: true })
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
    const selectedModelIndex = Math.max(0, options.findIndex((item) => item.key === selectedModelKey));
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
    const selected = this.data.modelOptions.find((item) => item.key === key) || DEFAULT_MODEL_OPTIONS[0];
    saveStoredModelKey(selected.key);
    this.setData({
      showModelPicker: false,
      modelSearchKeyword: '',
      selectedModelKey: selected.key,
      selectedModelName: selected.label,
      selectedModelIndex: Math.max(0, this.data.modelOptions.findIndex((item) => item.key === selected.key)),
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

  async refreshConversationState() {
    const messages = await hydrateMessages(loadMessages());
    const conversationId = getActiveConversationId();
    const conv = listConversations().find((c) => c.id === conversationId);
    this.setData({
      messages,
      sessionId: conv ? conv.sessionId : '',
      conversationId,
      chatTitle: conv ? conv.title : '新对话',
      activeConversationId: conversationId,
    });
  },

  /**
   * @param {{ fetchRemote?: boolean }} [options]
   * fetchRemote 为 true 时请求 ai/conversations（打开历史抽屉时使用）
   */
  async refreshHistoryList(options = {}) {
    const { fetchRemote = false } = options;
    let conversations = listConversations();
    if (fetchRemote && hasLoginToken()) {
      const reqId = (this._historyFetchId = (this._historyFetchId || 0) + 1);
      try {
        const res = await aiApi.listConversations({ page: 1, limit: 30 });
        if (reqId !== this._historyFetchId) return;
        const remoteConversations = normalizeRemoteConversations(res);
        conversations = mergeRemoteConversations(remoteConversations);
      } catch (e) {
        if (reqId !== this._historyFetchId) return;
        console.warn('[mknow] load remote conversations failed', e);
      }
    }
    const activeConversationId = this.data.conversationId || getActiveConversationId();
    this.setData({
      conversations,
      activeConversationId,
      historyGroups: buildHistoryGroups(
        conversations,
        this.data.historyKeyword,
        activeConversationId,
      ),
    });
  },

  onHistorySearch(e) {
    const historyKeyword = (e.detail.value || '').trim();
    this.setData({
      historyKeyword,
      historyGroups: buildHistoryGroups(
        this.data.conversations,
        historyKeyword,
        this.data.activeConversationId,
      ),
    });
  },

  onClearHistorySearch() {
    this.setData({ historyKeyword: '', historySearchFocus: false });
    this.refreshHistoryList();
  },

  onOpenHistory() {
    this.setData({ showHistory: true, historySearchFocus: false });
    this.refreshHistoryList({ fetchRemote: true });
  },

  onCloseHistory(e) {
    const visible = e && e.detail ? e.detail.visible : false;
    if (!visible) {
      this.setData({ showHistory: false, historySearchFocus: false });
    }
  },

  onFocusHistorySearch() {
    this.setData({ historySearchFocus: true });
  },

  onBlurHistorySearch() {
    if (!this.data.historyKeyword) {
      this.setData({ historySearchFocus: false });
    }
  },

  async onSelectConversation(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || id === this.data.conversationId) {
      this.setData({ showHistory: false });
      return;
    }
    const remoteConv = (this.data.conversations || []).find((c) => c.id === id && c.remote);
    if (remoteConv && hasLoginToken()) {
      try {
        const res = await aiApi.getMessages(remoteConv.sessionId || id);
        const messages = await normalizeRemoteMessages(res);
        const saved = saveRemoteConversation(remoteConv, stripRendered(messages));
        this.setData({
          messages: await hydrateMessages(saved.messages),
          sessionId: saved.sessionId,
          conversationId: saved.conversationId,
          chatTitle: saved.title || remoteConv.title || '新对话',
          showHistory: false,
          input: '',
          sending: false,
          anchor: '',
        });
        this.refreshHistoryList();
        wx.nextTick(() => this.scrollToBottom());
        return;
      } catch (err) {
        console.warn('[mknow] load remote messages failed', err);
        this.onShowToast('#t-toast', '历史消息加载失败，已尝试本地记录');
      }
    }
    const result = switchConversation(id);
    if (!result) return;
    this.setData({
      messages: await hydrateMessages(result.messages),
      sessionId: result.sessionId,
      conversationId: id,
      chatTitle: result.title || '新对话',
      showHistory: false,
      input: '',
      sending: false,
      anchor: '',
    });
    this.refreshHistoryList();
    wx.nextTick(() => this.scrollToBottom());
  },

  onLongPressConversation(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.showModal({
      title: '删除对话',
      content: '确定删除该条历史对话吗？',
      confirmColor: '#d54941',
      success: (res) => {
        if (!res.confirm) return;
        this.deleteConversationById(id);
      },
    });
  },

  async deleteConversationById(id) {
    const target = (this.data.conversations || []).find((c) => c.id === id);
    if (target && target.remote && hasLoginToken()) {
      try {
        await aiApi.deleteConversation(target.sessionId || id);
      } catch (err) {
        console.warn('[mknow] delete remote conversation failed', err);
        this.onShowToast('#t-toast', '删除失败，请稍后重试');
        return;
      }
    }
    const result = deleteConversation(id);
    if (!result) return;
    this.setData({
      messages: await hydrateMessages(result.messages),
      sessionId: result.sessionId,
      conversationId: result.conversationId,
      chatTitle: '新对话',
    });
    this.refreshHistoryList();
    this.onShowToast('#t-toast', '已删除');
  },

  onDeleteConversation(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    e.stopPropagation && e.stopPropagation();

    wx.showModal({
      title: '删除对话',
      content: '确定删除该条历史对话吗？',
      success: (res) => {
        if (!res.confirm) return;
        this.deleteConversationById(id);
      },
    });
  },

  async onNewChat() {
    if (this.data.sending) {
      this.onShowToast('#t-toast', '请等待当前回复完成');
      return;
    }

    if (hasLoginToken()) {
      try {
        const res = await aiApi.createConversation({ title: '新对话' });
        const remote = normalizeRemoteConversations({ data: [res.data] })[0];
        const saved = saveRemoteConversation(remote, []);
        this.setData({
          messages: [],
          sessionId: saved.sessionId,
          conversationId: saved.conversationId,
          chatTitle: '新对话',
          input: '',
          anchor: '',
          showHistory: false,
        });
        this.refreshHistoryList();
        this.onShowToast('#t-toast', '已新建对话');
        return;
      } catch (err) {
        console.warn('[mknow] create remote conversation failed', err);
      }
    }

    const result = createConversation();
    if (result.isExistingEmpty) {
      this.onShowToast('#t-toast', '当前已是新对话');
      return;
    }

    this.setData({
      messages: [],
      sessionId: result.sessionId,
      conversationId: result.conversationId,
      chatTitle: '新对话',
      input: '',
      anchor: '',
      showHistory: false,
    });
    this.refreshHistoryList();
    this.onShowToast('#t-toast', '已新建对话');
  },

  onExportToPublish() {
    const { messages, sending } = this.data;
    if (sending) {
      this.onShowToast('#t-toast', '请等待回复完成');
      return;
    }

    const valid = (messages || []).filter((m) => m.content && !m.pending);
    if (valid.length < 2) {
      this.onShowToast('#t-toast', '至少需要一轮完整问答');
      return;
    }

    if (!app.checkLoginStatus()) {
      app.navigateToLogin({ url: '/pages/mknow/index' });
      return;
    }

    const { title, content } = messagesToMarkdown(messages);
    setPendingPublish({ docTitle: title, markdownContent: content });

    wx.navigateTo({
      url: '/pages/publish/index?from=mknow',
      fail: () => {
        this.onShowToast('#t-toast', '无法打开发布页');
      },
    });
  },

  onSuggestionTap(e) {
    const { text } = e.currentTarget.dataset;
    if (!text) return;
    this.sendQuestion(text);
  },

  handleInput(e) {
    this.setData({ input: e.detail.value });
  },

  handleKeyboardHeightChange(e) {
    const { height } = e.detail;
    if (!height) return;
    this.setData({ keyboardHeight: height });
    wx.nextTick(() => this.scrollToBottom());
  },

  handleBlur() {
    this.setData({ keyboardHeight: 0 });
  },

  handleSubmit() {
    const { input, sending } = this.data;
    if (sending || !input.trim()) return;
    this.sendQuestion(input.trim());
  },

  sendQuestion(content) {
    if (!content) return;

    if (!app.checkLoginStatus()) {
      app.navigateToLogin({ url: '/pages/mknow/index' });
      return;
    }

    const userMsg = createMessage('user', content);
    const messages = [...this.data.messages, userMsg];
    const pendingId = `assistant_pending_${Date.now()}`;

    const chatTitle =
      this.data.messages.length === 0
        ? content.length > 24
          ? `${content.slice(0, 24)}…`
          : content
        : this.data.chatTitle;

    this.setData({
      messages: [
        ...messages,
        createMessage('assistant', '', {
          pending: true,
          streaming: true,
          id: pendingId,
          modelName: this.data.selectedModelName,
        }),
      ],
      input: '',
      sending: true,
      streaming: true,
      chatTitle,
    });
    saveMessages(stripRendered(messages));
    this.refreshHistoryList();
    wx.nextTick(() => this.scrollToBottom());

    this.requestAiReply(content, pendingId, messages);
  },

  async requestAiReply(content, pendingId, historyBeforeAssistant) {
    const { sessionId } = this.data;
    const payload = {
        content,
        sessionId,
        modelKey: this.data.selectedModelKey || 'auto',
        messages: historyBeforeAssistant.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };

    try {
      await this.requestAiReplyStream(payload, pendingId, content);
    } catch (streamErr) {
      console.warn('[mknow] ai stream failed, use json chat', streamErr);
      try {
        const res = await aiApi.chat(payload);
      const reply = extractReplyText(res) || buildFallbackReply(content);
      const data = res && res.data ? res.data : {};
      const errorType = extractErrorType(res);
      if (errorType) {
        this.onShowToast('#t-toast', data.errorMessage || reply);
      }
      this.finishAssistantMessage(pendingId, reply, false, {
        sessionId: data.sessionId,
        conversationId: data.conversationId,
        sources: extractSources(res),
        errorType,
        modelKey: data.modelKey,
        modelName: data.modelName,
      });
      } catch (err) {
        console.warn('[mknow] ai chat failed, use fallback', err);
      this.finishAssistantMessage(pendingId, buildFallbackReply(content), true);
      }
    }
  },

  requestAiReplyStream(payload, pendingId, question) {
    return new Promise((resolve, reject) => {
      let reply = '';
      let meta = {};
      let settled = false;
      let received = false;
      this.streamTask = aiApi.chatStream(payload, {
        onMeta: (data) => {
          received = true;
          meta = data || {};
          this.updateStreamingAssistant(pendingId, reply, meta);
        },
        onToken: (delta) => {
          received = true;
          reply += delta || '';
          this.updateStreamingAssistant(pendingId, reply, meta);
        },
        onDone: (data) => {
          if (settled) return;
          settled = true;
          const finalData = { ...meta, ...(data || {}) };
          this.finishAssistantMessage(pendingId, reply || finalData.reply || buildFallbackReply(question), false, {
            sessionId: finalData.sessionId,
            conversationId: finalData.conversationId,
            sources: finalData.sources || [],
            modelKey: finalData.modelKey,
            modelName: finalData.modelName,
          });
          resolve(finalData);
        },
        onError: (err) => {
          if (settled) return;
          settled = true;
          if (received && err && err.errorMessage) {
            this.finishAssistantMessage(pendingId, err.errorMessage, true, {
              sessionId: err.sessionId || meta.sessionId,
              conversationId: err.conversationId || meta.conversationId,
              errorType: err.errorType || 'AI_UNAVAILABLE',
              modelName: err.modelName || meta.modelName,
            });
            resolve(err);
            return;
          }
          reject(err);
        },
      });
      if (!this.streamTask || !this.streamTask.onChunkReceived) {
        reject(new Error('当前环境不支持流式输出'));
      }
    });
  },

  updateStreamingAssistant(pendingId, content, meta = {}) {
    const now = Date.now();
    if (this._lastRenderAt && now - this._lastRenderAt < 180) {
      clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        this._lastRenderAt = Date.now();
        this.updateStreamingAssistant(pendingId, content, meta);
      }, 180);
      return;
    }
    this._lastRenderAt = now;
    renderMarkdownAsync(content).then((renderedContent) => {
      const messages = this.data.messages.map((m) => {
        if (m.id !== pendingId) return m;
        return {
          ...m,
          content,
          pending: false,
          streaming: true,
          sources: meta.sources || m.sources || [],
          modelName: meta.modelName || m.modelName || this.data.selectedModelName,
          renderedContent: renderedContent || m.renderedContent,
        };
      });
      this.setData({ messages });
      wx.nextTick(() => this.scrollToBottom());
    });
  },

  async finishAssistantMessage(pendingId, content, isFallback, extra = {}) {
    const renderedContent = await renderMarkdownAsync(content);
    const messages = this.data.messages
      .filter((m) => m.id !== pendingId)
      .concat(createMessage('assistant', content, {
        fallback: isFallback || extra.errorType === 'AI_UNAVAILABLE',
        sources: extra.sources || [],
        errorType: extra.errorType || '',
        modelName: extra.modelName || this.data.selectedModelName,
        renderedContent,
      }));

    if (extra.sessionId || extra.conversationId) {
      const saved = saveRemoteConversation(
        {
          sessionId: extra.sessionId || this.data.sessionId,
          conversationId: extra.conversationId || extra.sessionId || this.data.conversationId,
          title: this.data.chatTitle,
          updatedAt: Date.now(),
        },
        stripRendered(messages),
      );
      this.setData({
        messages,
        sending: false,
        streaming: false,
        sessionId: saved.sessionId,
        conversationId: saved.conversationId,
        activeConversationId: saved.conversationId,
      });
    } else {
      this.setData({ messages, sending: false, streaming: false });
    }
    saveMessages(stripRendered(messages));
    this.refreshHistoryList();
    wx.nextTick(() => this.scrollToBottom());
  },

  scrollToBottom() {
    this.setData({ anchor: 'mknow-bottom' });
  },

  onClearChat() {
    if (!this.data.messages.length) return;
    wx.showModal({
      title: '清空对话',
      content: '确定清空当前会话记录吗？',
      success: (res) => {
        if (!res.confirm) return;
        clearMessages();
        this.setData({ messages: [], input: '', anchor: '', chatTitle: '新对话' });
        this.refreshHistoryList();
        this.onShowToast('#t-toast', '已清空');
      },
    });
  },
});
