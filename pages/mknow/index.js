import { aiApi } from '~/api/request/api_ai';
import useToastBehavior from '~/behaviors/useToast';
import {
  clearMessages,
  getSessionId,
  loadMessages,
  resetSessionId,
  saveMessages,
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
  },

  onLoad() {
    const messages = loadMessages();
    this.setData({
      messages,
      sessionId: getSessionId(),
    });
    if (messages.length) {
      wx.nextTick(() => this.scrollToBottom());
    }
  },

  onShow() {
    this.setData({ sessionId: getSessionId() });
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

    this.setData({
      messages: [
        ...messages,
        createMessage('assistant', '', { pending: true, id: pendingId }),
      ],
      input: '',
      sending: true,
    });
    saveMessages(messages);
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
        const sessionId = resetSessionId();
        this.setData({ messages: [], input: '', sessionId, anchor: '' });
        this.onShowToast('#t-toast', '已清空');
      },
    });
  },
});
