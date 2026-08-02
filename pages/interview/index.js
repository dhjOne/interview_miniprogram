import useToastBehavior from '~/behaviors/useToast';
import { aiApi } from '~/api/request/api_ai';
import { createInterviewSocket, createSessionId } from '~/utils/interviewWs';

const app = getApp();

const SCENE = 'AI_INTERVIEW';

const SUGGESTIONS = [
  { id: 1, text: '我是 Java 后端，请开始模拟面试', icon: 'code' },
  { id: 2, text: '请按中级前端岗位出题', icon: 'logo-chrome' },
  { id: 3, text: '先问我一道 Redis 相关题', icon: 'server' },
];

function shortId(id) {
  if (!id) return '';
  return id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;
}

function unwrapPageRows(res) {
  const data = res && res.data !== undefined ? res.data : res;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.records)) return data.records;
  return [];
}

function unwrapList(res) {
  const data = res && res.data !== undefined ? res.data : res;
  return Array.isArray(data) ? data : [];
}

Page({
  behaviors: [useToastBehavior],

  data: {
    suggestions: SUGGESTIONS,
    messages: [],
    input: '',
    sending: false,
    connected: false,
    connecting: false,
    sessionId: '',
    sessionIdShort: '',
    statusText: '未连接',
    statusClass: 'iv-status',
    anchor: '',
    showHistory: false,
    historyLoading: false,
    historyList: [],
  },

  onLoad() {
    if (!app.checkLoginStatus()) {
      app.navigateToLogin({ url: '/pages/interview/index' });
      return;
    }
    const sessionId = createSessionId();
    this.setData({
      sessionId,
      sessionIdShort: shortId(sessionId),
    });
  },

  onUnload() {
    this.closeSocket();
  },

  handleInput(e) {
    this.setData({ input: e.detail.value });
  },

  onSuggestionTap(e) {
    const { text } = e.currentTarget.dataset;
    if (!text) return;
    this.ensureConnected(() => this.sendQuestion(text));
  },

  handleSubmit() {
    const { input, sending, connected } = this.data;
    if (sending || !connected || !input.trim()) return;
    this.sendQuestion(input.trim());
  },

  onToggleConnect() {
    if (this.data.connected || this.data.connecting) {
      this.closeSocket();
      this.setStatus('未连接');
      return;
    }
    this.connectSocket();
  },

  onOpenHistory() {
    this.setData({ showHistory: true });
    this.loadHistory();
  },

  onCloseHistory() {
    this.setData({ showHistory: false });
  },

  async loadHistory() {
    if (!app.checkLoginStatus()) return;
    this.setData({ historyLoading: true });
    try {
      const res = await aiApi.listConversations({ page: 1, limit: 30, scene: SCENE });
      const rows = unwrapPageRows(res).map((item) => ({
        sessionId: item.sessionId || item.conversationId,
        title: item.title || '面试会话',
        preview: item.preview || '',
        messageCount: item.messageCount || 0,
        updatedAt: item.updatedAt || '',
        active: (item.sessionId || item.conversationId) === this.data.sessionId,
      }));
      this.setData({ historyList: rows });
    } catch (e) {
      this.onShowToast('#t-toast', (e && e.message) || '加载历史失败');
    } finally {
      this.setData({ historyLoading: false });
    }
  },

  async onSelectHistory(e) {
    const { sessionId } = e.currentTarget.dataset;
    if (!sessionId) return;
    this.closeSocket();
    this.setData({
      showHistory: false,
      sessionId,
      sessionIdShort: shortId(sessionId),
      messages: [],
      input: '',
      sending: false,
    });
    this.setStatus('未连接');
    try {
      const res = await aiApi.getMessages(sessionId);
      const messages = unwrapList(res).map((m, idx) => ({
        id: `h_${m.id || idx}`,
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || '',
        streaming: false,
      }));
      this.setData({ messages });
      this.scrollToBottom();
      this.onShowToast('#t-toast', '已恢复历史面试');
    } catch (err) {
      this.onShowToast('#t-toast', (err && err.message) || '加载消息失败');
    }
  },

  async onDeleteHistory(e) {
    const { sessionId } = e.currentTarget.dataset;
    if (!sessionId) return;
    try {
      await aiApi.deleteConversation(sessionId);
      if (sessionId === this.data.sessionId) {
        this.onNewSession();
      }
      await this.loadHistory();
      this.onShowToast('#t-toast', '已删除');
    } catch (err) {
      this.onShowToast('#t-toast', (err && err.message) || '删除失败');
    }
  },

  async onNewSession() {
    this.closeSocket();
    let sessionId = createSessionId();
    try {
      const res = await aiApi.createConversation({ title: '新面试', scene: SCENE });
      const data = res && res.data !== undefined ? res.data : res;
      if (data && data.sessionId) {
        sessionId = data.sessionId;
      }
    } catch (e) {
      // 本地生成兜底
    }
    this.setData({
      messages: [],
      input: '',
      sending: false,
      sessionId,
      sessionIdShort: shortId(sessionId),
      anchor: '',
      showHistory: false,
    });
    this.setStatus('未连接');
    this.onShowToast('#t-toast', '已开启新面试会话');
  },

  ensureConnected(cb) {
    if (this.data.connected) {
      cb && cb();
      return;
    }
    this.connectSocket(() => cb && cb());
  },

  connectSocket(onReady) {
    if (!app.checkLoginStatus()) {
      app.navigateToLogin({ url: '/pages/interview/index' });
      return;
    }
    if (this.data.connecting || this.data.connected) {
      onReady && onReady();
      return;
    }

    this.setData({ connecting: true });
    this.setStatus('连接中…', 'iv-status');
    try {
      this.socketClient = createInterviewSocket({
        sessionId: this.data.sessionId,
        onOpen: ({ sessionId }) => {
          this.setData({
            connected: true,
            connecting: false,
            sessionId: sessionId || this.data.sessionId,
            sessionIdShort: shortId(sessionId || this.data.sessionId),
          });
          this.setStatus('已连接', 'iv-status iv-status--online');
          onReady && onReady();
        },
        onMeta: (meta) => {
          if (meta && meta.sessionId) {
            this.setData({
              sessionId: meta.sessionId,
              sessionIdShort: shortId(meta.sessionId),
            });
          }
        },
        onMessage: (token) => this.appendAssistantToken(token),
        onDone: () => this.finishAssistantStream(),
        onError: (msg) => {
          this.setData({ sending: false, connecting: false });
          this.setStatus(msg || '连接异常', 'iv-status iv-status--error');
          this.onShowToast('#t-toast', msg || '面试服务异常');
          if (this._pendingId) {
            this.failPending(msg || '服务异常');
          }
        },
        onClose: () => {
          this.setData({ connected: false, connecting: false, sending: false });
          this.setStatus('已断开');
        },
      });
    } catch (e) {
      this.setData({ connecting: false });
      this.setStatus('连接失败', 'iv-status iv-status--error');
      this.onShowToast('#t-toast', (e && e.message) || '无法连接');
    }
  },

  closeSocket() {
    if (this.socketClient) {
      try {
        this.socketClient.close();
      } catch (e) {
        // ignore
      }
      this.socketClient = null;
    }
    this.setData({ connected: false, connecting: false, sending: false });
  },

  sendQuestion(content) {
    if (!content) return;
    if (!this.socketClient || !this.socketClient.isOpen()) {
      this.onShowToast('#t-toast', '请先连接面试官');
      return;
    }
    if (this.data.sending) {
      this.onShowToast('#t-toast', '当前会话正在生成，请稍后');
      return;
    }

    const userId = `u_${Date.now()}`;
    const pendingId = `a_${Date.now()}`;
    this._pendingId = pendingId;
    this._assistantBuffer = '';

    const messages = [
      ...this.data.messages,
      { id: userId, role: 'user', content },
      { id: pendingId, role: 'assistant', content: '', streaming: true },
    ];
    this.setData({
      messages,
      input: '',
      sending: true,
      statusClass: 'iv-status iv-status--busy',
      statusText: '面试官思考中…',
    });
    this.scrollToBottom();

    try {
      this.socketClient.send(content);
    } catch (e) {
      this.setData({ sending: false });
      this.failPending((e && e.message) || '发送失败');
    }
  },

  appendAssistantToken(token) {
    if (!this._pendingId) return;
    this._assistantBuffer = `${this._assistantBuffer || ''}${token || ''}`;
    const now = Date.now();
    if (this._lastRenderAt && now - this._lastRenderAt < 120) {
      clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        this._lastRenderAt = Date.now();
        this.renderPendingContent();
      }, 120);
      return;
    }
    this._lastRenderAt = now;
    this.renderPendingContent();
  },

  renderPendingContent() {
    const pendingId = this._pendingId;
    const content = this._assistantBuffer || '';
    const messages = this.data.messages.map((m) =>
      m.id === pendingId ? { ...m, content, streaming: true } : m,
    );
    this.setData({ messages });
    this.scrollToBottom();
  },

  finishAssistantStream() {
    const pendingId = this._pendingId;
    const content = (this._assistantBuffer || '').trim() || '（本轮无有效输出）';
    const messages = this.data.messages.map((m) =>
      m.id === pendingId ? { ...m, content, streaming: false } : m,
    );
    this._pendingId = null;
    this._assistantBuffer = '';
    this.setData({
      messages,
      sending: false,
      statusText: '已连接',
      statusClass: 'iv-status iv-status--online',
    });
    this.scrollToBottom();
  },

  failPending(message) {
    const pendingId = this._pendingId;
    if (!pendingId) return;
    const messages = this.data.messages.map((m) =>
      m.id === pendingId
        ? { ...m, content: message, streaming: false }
        : m,
    );
    this._pendingId = null;
    this._assistantBuffer = '';
    this.setData({ messages, sending: false });
  },

  setStatus(text, statusClass = 'iv-status') {
    this.setData({ statusText: text, statusClass });
  },

  scrollToBottom() {
    this.setData({ anchor: 'iv-bottom' });
  },
});
