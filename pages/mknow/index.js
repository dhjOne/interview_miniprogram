import { aiApi } from '~/api/request/api_ai';
import useToastBehavior from '~/behaviors/useToast';
import {
  clearMessages,
  createConversation,
  deleteConversation,
  getActiveConversationId,
  listConversations,
  loadMessages,
  messagesToMarkdown,
  saveMessages,
  setPendingPublish,
  switchConversation,
} from '~/utils/aiChatStorage';

const app = getApp();

const SUGGESTIONS = [
  { id: 1, text: '帮我梳理一道二叉树的中序遍历思路', icon: 'chart-bubble' },
  { id: 2, text: 'Java 线程池有哪些核心参数？', icon: 'server' },
  { id: 3, text: '前端性能优化可以从哪几方面入手？', icon: 'logo-miniprogram' },
  { id: 4, text: '模拟一场 3 分钟的项目经历自我介绍', icon: 'user' },
];

function createMessage(role, content, extra = {}) {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    time: Date.now(),
    ...extra,
  };
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
  },

  onLoad() {
    this.setData({ popupNavBarHeight: getNavContentHeight() });
    this.refreshConversationState();
    const { messages } = this.data;
    if (messages.length) {
      wx.nextTick(() => this.scrollToBottom());
    }
  },

  onShow() {
    this.refreshHistoryList();
  },

  refreshConversationState() {
    const messages = loadMessages();
    const conversationId = getActiveConversationId();
    const conv = listConversations().find((c) => c.id === conversationId);
    this.setData({
      messages,
      sessionId: conv ? conv.sessionId : '',
      conversationId,
      chatTitle: conv ? conv.title : '新对话',
      activeConversationId: conversationId,
    });
    this.refreshHistoryList();
  },

  refreshHistoryList() {
    const conversations = listConversations();
    const activeConversationId = getActiveConversationId();
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
    this.refreshHistoryList();
    this.setData({ showHistory: true, historySearchFocus: false });
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

  onSelectConversation(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || id === this.data.conversationId) {
      this.setData({ showHistory: false });
      return;
    }
    const result = switchConversation(id);
    if (!result) return;
    this.setData({
      messages: result.messages,
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

  deleteConversationById(id) {
    const result = deleteConversation(id);
    if (!result) return;
    this.setData({
      messages: result.messages,
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

  onNewChat() {
    if (this.data.sending) {
      this.onShowToast('#t-toast', '请等待当前回复完成');
      return;
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
        createMessage('assistant', '', { pending: true, id: pendingId }),
      ],
      input: '',
      sending: true,
      chatTitle,
    });
    saveMessages(messages);
    this.refreshHistoryList();
    wx.nextTick(() => this.scrollToBottom());

    this.requestAiReply(content, pendingId, messages);
  },

  async requestAiReply(content, pendingId, historyBeforeAssistant) {
    const { sessionId } = this.data;

    try {
      const res = await aiApi.chat({
        content,
        sessionId,
        messages: historyBeforeAssistant.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
      const reply = extractReplyText(res) || buildFallbackReply(content);
      this.finishAssistantMessage(pendingId, reply, false);
    } catch (err) {
      console.warn('[mknow] ai chat failed, use fallback', err);
      this.finishAssistantMessage(pendingId, buildFallbackReply(content), true);
    }
  },

  finishAssistantMessage(pendingId, content, isFallback) {
    const messages = this.data.messages
      .filter((m) => m.id !== pendingId)
      .concat(createMessage('assistant', content, { fallback: isFallback }));

    this.setData({ messages, sending: false });
    saveMessages(messages);
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
