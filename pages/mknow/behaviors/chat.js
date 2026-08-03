import { aiApi } from '~/api/index';
import {
  messagesToMarkdown,
  saveMessages,
  saveRemoteConversation,
  setPendingPublish,
} from '~/utils/aiChatStorage';
import { createMessage, stripRendered } from '~/utils/mknowHelpers';
import { openPage } from '~/utils/router';

const app = getApp();
const { renderMarkdown: renderMarkdownAsync } = require('../../../utils/towxmlLoader');

const STREAM_RENDER_INTERVAL = 120;

function persistableMessages(messages = []) {
  return stripRendered(messages.filter((message) => !message.transient));
}

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

      const valid = (messages || []).filter((m) => m.content && !m.pending && !m.transient);
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

    handleComposerAction() {
      if (this.data.sending) {
        this.abortActiveStream({ reason: 'user' });
        return;
      }
      this.handleSubmit();
    },

    sendQuestion(content) {
      if (!content) return;

      if (!app.checkLoginStatus()) {
        app.navigateToLogin({ url: '/pages/mknow/index' });
        return;
      }

      const quota = this.data.aiQuota || {};
      if (this.data.showAiQuota && Number(quota.totalRemaining || 0) <= 0) {
        if (typeof this.showQuotaExhaustedGuide === 'function') {
          this.showQuotaExhaustedGuide();
        } else {
          this.onShowToast('#t-toast', 'AI 次数已用完');
        }
        return;
      }

      const userMsg = createMessage('user', content);
      const messages = [...this.data.messages, userMsg];
      const pendingId = `assistant_pending_${Date.now()}`;
      const generation = (this._streamGeneration || 0) + 1;
      this._streamGeneration = generation;
      this._activeStream = {
        generation,
        pendingId,
        question: content,
        sessionId: this.data.sessionId,
        conversationId: this.data.conversationId,
      };

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
      saveMessages(persistableMessages(messages));
      this.refreshHistoryList();
      wx.nextTick(() => this.scrollToBottom());

      this.requestAiReply(content, pendingId, messages, generation);
    },

    isActiveStream(generation, pendingId) {
      const active = this._activeStream;
      return !!active && active.generation === generation && active.pendingId === pendingId;
    },

    settleActiveStream(generation) {
      if (!this._activeStream || this._activeStream.generation !== generation) return;
      this._activeStream = null;
      this.streamTask = null;
      clearTimeout(this._renderTimer);
      this._renderTimer = null;
    },

    handleRecoverableError(pendingId, question, message, errorType, generation) {
      if (!this.isActiveStream(generation, pendingId)) return;
      const withoutPending = (this.data.messages || []).filter((m) => m.id !== pendingId);
      const last = withoutPending[withoutPending.length - 1];
      const messages =
        last && last.role === 'user' && last.content === question
          ? withoutPending.slice(0, -1)
          : withoutPending;
      this.settleActiveStream(generation);
      this.setData({
        messages,
        input: question,
        sending: false,
        streaming: false,
      });
      saveMessages(persistableMessages(messages));
      this.refreshHistoryList();

      if (errorType === 'QUOTA_EXCEEDED') {
        if (typeof this.loadAiQuota === 'function') this.loadAiQuota();
        if (typeof this.showQuotaExhaustedGuide === 'function') {
          this.showQuotaExhaustedGuide();
        } else {
          this.onShowToast('#t-toast', message || 'AI 次数已用完');
        }
        return;
      }

      const fallback =
        errorType === 'SESSION_BUSY'
          ? '当前会话正在生成，请稍后'
          : errorType === 'RATE_LIMIT'
          ? '请求太频繁，请稍后再试'
          : '内容包含敏感信息，请修改后重试';
      this.onShowToast('#t-toast', message || fallback);
    },

    async requestAiReply(content, pendingId, historyBeforeAssistant, generation) {
      const { sessionId } = this.data;
      const payload = {
        content,
        sessionId,
        modelKey: this.data.selectedModelKey || 'auto',
        messages: historyBeforeAssistant
          .filter((m) => !m.transient)
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
      };

      try {
        await this.requestAiReplyStream(payload, pendingId, content, generation);
      } catch (streamErr) {
        if (!this.isActiveStream(generation, pendingId)) return;
        console.warn('[mknow] ai stream failed', streamErr);
        const message =
          (streamErr && (streamErr.errorMessage || streamErr.message || streamErr.errMsg)) ||
          'AI 服务暂时不可用';
        this.finishStreamFailure(
          pendingId,
          content,
          message,
          (streamErr && (streamErr.errorType || streamErr.code)) || 'AI_UNAVAILABLE',
          generation,
        );
      }
    },

    requestAiReplyStream(payload, pendingId, question, generation) {
      return new Promise((resolve, reject) => {
        let reply = '';
        let meta = {};
        let settled = false;
        this.streamTask = aiApi.chatStream(payload, {
          onMeta: (data) => {
            if (!this.isActiveStream(generation, pendingId)) return;
            meta = data || {};
            this.updateStreamingAssistant(pendingId, reply, meta, generation);
          },
          onToken: (delta) => {
            if (!this.isActiveStream(generation, pendingId)) return;
            reply += delta || '';
            this.updateStreamingAssistant(pendingId, reply, meta, generation);
          },
          onDone: (data) => {
            if (settled) return;
            settled = true;
            if (!this.isActiveStream(generation, pendingId)) {
              resolve(data);
              return;
            }
            const finalData = { ...meta, ...(data || {}) };
            const answer = reply || finalData.reply || '';
            if (answer.trim()) {
              this.finishAssistantMessage(
                pendingId,
                answer,
                {
                  sessionId: finalData.sessionId,
                  conversationId: finalData.conversationId,
                  sources: finalData.sources || [],
                  modelKey: finalData.modelKey,
                  modelName: finalData.modelName,
                },
                generation,
              );
            } else {
              this.finishStreamFailure(
                pendingId,
                question,
                '本轮未返回有效内容，请重试',
                'EMPTY_RESPONSE',
                generation,
              );
            }
            resolve(finalData);
          },
          onError: (err) => {
            if (settled) return;
            settled = true;
            if (!this.isActiveStream(generation, pendingId)) {
              resolve(err);
              return;
            }
            const errorType = (err && (err.errorType || err.code)) || '';
            const errorMessage =
              (err && (err.errorMessage || err.message || err.errMsg)) || 'AI 服务暂时不可用';

            if (
              errorType === 'QUOTA_EXCEEDED' ||
              errorType === 'RATE_LIMIT' ||
              errorType === 'SESSION_BUSY' ||
              errorType === 'SENSITIVE_CONTENT'
            ) {
              this.handleRecoverableError(pendingId, question, errorMessage, errorType, generation);
              resolve(err);
              return;
            }

            this.finishStreamFailure(
              pendingId,
              question,
              errorMessage,
              errorType || 'AI_UNAVAILABLE',
              generation,
              reply,
              meta,
            );
            if (errorType === 'UNAUTHORIZED') {
              this.onShowToast('#t-toast', errorMessage);
              if (app && typeof app.navigateToLogin === 'function') {
                app.navigateToLogin({ url: '/pages/mknow/index' });
              }
            }
            resolve(err);
          },
          onAbort: () => {
            if (settled) return;
            settled = true;
            resolve({ cancelled: true });
          },
        });
        if (!this.streamTask || !this.streamTask.onChunkReceived) {
          const unsupportedError = new Error('当前微信版本不支持流式输出，请升级后重试');
          unsupportedError.errorType = 'STREAM_UNSUPPORTED';
          unsupportedError.errorMessage = unsupportedError.message;
          reject(unsupportedError);
        }
      });
    },

    finishStreamFailure(
      pendingId,
      question,
      message,
      errorType,
      generation,
      partialContent = '',
      meta = {},
    ) {
      if (!this.isActiveStream(generation, pendingId)) return;
      const messages = (this.data.messages || []).map((item) => {
        if (item.id !== pendingId) return item;
        return {
          ...item,
          content: partialContent || message,
          pending: false,
          streaming: false,
          transient: true,
          interrupted: !!partialContent,
          failed: true,
          errorMessage: message,
          errorType,
          retryQuestion: errorType === 'UNAUTHORIZED' ? '' : question,
          modelName: meta.modelName || item.modelName || this.data.selectedModelName,
        };
      });
      this.settleActiveStream(generation);
      this.setData({ messages, sending: false, streaming: false });
      saveMessages(persistableMessages(messages));
      this.refreshHistoryList();
      wx.nextTick(() => this.scrollToBottom());
    },

    abortActiveStream(options = {}) {
      const { reason = 'cancelled', silent = false } = options;
      const active = this._activeStream;
      const task = this.streamTask;
      this._streamGeneration = (this._streamGeneration || 0) + 1;
      this._activeStream = null;
      this.streamTask = null;
      clearTimeout(this._renderTimer);
      this._renderTimer = null;

      let messages = this.data.messages || [];
      if (active) {
        messages = messages.map((item) => {
          if (item.id !== active.pendingId) return item;
          const partial = (item.content || '').trim();
          return {
            ...item,
            content: partial || '生成已停止',
            pending: false,
            streaming: false,
            transient: true,
            interrupted: true,
            failed: false,
            errorType: 'CANCELLED',
            errorMessage: '生成已停止',
            retryQuestion: active.question,
          };
        });
      }

      this.setData({ messages, sending: false, streaming: false });
      saveMessages(persistableMessages(messages));
      this.refreshHistoryList();
      if (task && typeof task.abort === 'function') {
        try {
          task.abort();
        } catch (e) {
          console.warn('[mknow] abort stream failed', e);
        }
      }
      if (!silent && active && reason === 'user') {
        this.onShowToast('#t-toast', '已停止生成');
      }
    },

    updateStreamingAssistant(pendingId, content, meta = {}, generation) {
      if (!this.isActiveStream(generation, pendingId)) return;
      const now = Date.now();
      if (this._lastRenderAt && now - this._lastRenderAt < STREAM_RENDER_INTERVAL) {
        clearTimeout(this._renderTimer);
        this._renderTimer = setTimeout(() => {
          this._lastRenderAt = Date.now();
          this.updateStreamingAssistant(pendingId, content, meta, generation);
        }, STREAM_RENDER_INTERVAL);
        return;
      }
      this._lastRenderAt = now;
      const messages = this.data.messages.map((m) => {
        if (m.id !== pendingId) return m;
        return {
          ...m,
          content,
          pending: !content,
          streaming: true,
          sources: meta.sources || m.sources || [],
          modelName: meta.modelName || m.modelName || this.data.selectedModelName,
          renderedContent: null,
        };
      });
      this.setData({ messages });
      wx.nextTick(() => this.scrollToBottom());
    },

    async finishAssistantMessage(pendingId, content, extra = {}, generation) {
      if (!this.isActiveStream(generation, pendingId)) return;
      if (!(this.data.messages || []).some((message) => message.id === pendingId)) return;
      let renderedContent = null;
      try {
        renderedContent = await renderMarkdownAsync(content);
      } catch (err) {
        console.warn('[mknow] render markdown failed, use plain text', err);
      }
      if (!this.isActiveStream(generation, pendingId)) return;
      const messages = this.data.messages.map((message) => {
        if (message.id !== pendingId) return message;
        return {
          ...message,
          content,
          pending: false,
          streaming: false,
          transient: false,
          failed: false,
          interrupted: false,
          sources: extra.sources || [],
          errorType: extra.errorType || '',
          modelName: extra.modelName || this.data.selectedModelName,
          renderedContent,
        };
      });

      this.settleActiveStream(generation);
      if (extra.sessionId || extra.conversationId) {
        const saved = saveRemoteConversation(
          {
            sessionId: extra.sessionId || this.data.sessionId,
            conversationId: extra.conversationId || extra.sessionId || this.data.conversationId,
            title: this.data.chatTitle,
            updatedAt: Date.now(),
          },
          persistableMessages(messages),
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
      saveMessages(persistableMessages(messages));
      this.refreshHistoryList();
      if (typeof this.loadAiQuota === 'function') {
        this.loadAiQuota();
      }
      wx.nextTick(() => this.scrollToBottom());
    },

    onRetryMessage(e) {
      if (this.data.sending) return;
      const { id, question } = e.currentTarget.dataset;
      if (!id || !question) return;
      const failedIndex = (this.data.messages || []).findIndex((message) => message.id === id);
      if (failedIndex < 0) return;
      const messages = [...this.data.messages];
      messages.splice(failedIndex, 1);
      const previous = messages[failedIndex - 1];
      if (previous && previous.role === 'user' && previous.content === question) {
        messages.splice(failedIndex - 1, 1);
      }
      this.setData({ messages });
      saveMessages(persistableMessages(messages));
      this.sendQuestion(question);
    },

    scrollToBottom() {
      this.setData({ anchor: 'mknow-bottom' });
    },

    onClearChat() {
      if (!this.data.messages.length) return;
      wx.showModal({
        title: '清空对话',
        content: '将清空当前会话及其上下文，确定继续吗？',
        success: async (res) => {
          if (!res.confirm) return;
          if (typeof this.resetCurrentConversation !== 'function') return;
          try {
            await this.resetCurrentConversation();
            this.onShowToast('#t-toast', '已清空并开启新对话');
          } catch (err) {
            console.warn('[mknow] clear conversation failed', err);
            this.onShowToast('#t-toast', '清空失败，请稍后重试');
          }
        },
      });
    },
  },
});

export default mknowChatBehavior;
