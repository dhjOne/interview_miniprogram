import { aiApi } from '~/api/index';
import {
  clearMessages,
  messagesToMarkdown,
  saveMessages,
  saveRemoteConversation,
  setPendingPublish,
} from '~/utils/aiChatStorage';
import {
  buildFallbackReply,
  createMessage,
  extractErrorType,
  extractReplyText,
  extractSources,
  stripRendered,
} from '~/utils/mknowHelpers';
import { openPage } from '~/utils/router';

const app = getApp();
const { renderMarkdown: renderMarkdownAsync } = require('../../../utils/towxmlLoader');

const SUGGESTIONS = [
  { id: 1, text: '帮我梳理一道二叉树的中序遍历思路', icon: 'chart-bubble' },
  { id: 2, text: 'Java 线程池有哪些核心参数？', icon: 'server' },
  { id: 3, text: '前端性能优化可以从哪几方面入手？', icon: 'logo-miniprogram' },
  { id: 4, text: '模拟一场 3 分钟的项目经历自我介绍', icon: 'user' },
];

/**
 * m知道：发问、流式回复、导出发布、清空
 * 依赖：refreshHistoryList、onShowToast；页面提供 selectedModelKey/Name
 */
const mknowChatBehavior = Behavior({
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
  },

  methods: {
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

      openPage({
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
            this.finishAssistantMessage(
              pendingId,
              reply || finalData.reply || buildFallbackReply(question),
              false,
              {
                sessionId: finalData.sessionId,
                conversationId: finalData.conversationId,
                sources: finalData.sources || [],
                modelKey: finalData.modelKey,
                modelName: finalData.modelName,
              },
            );
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
        .concat(
          createMessage('assistant', content, {
            fallback: isFallback || extra.errorType === 'AI_UNAVAILABLE',
            sources: extra.sources || [],
            errorType: extra.errorType || '',
            modelName: extra.modelName || this.data.selectedModelName,
            renderedContent,
          }),
        );

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
  },
});

export default mknowChatBehavior;
