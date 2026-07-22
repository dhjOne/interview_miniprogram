import { aiApi, handleApiError } from '~/api/index';
import {
  createConversation,
  deleteConversation,
  getActiveConversationId,
  listConversations,
  loadMessages,
  mergeRemoteConversations,
  saveRemoteConversation,
  switchConversation,
} from '~/utils/aiChatStorage';
import {
  buildHistoryGroups,
  hasLoginToken,
  hydrateMessages,
  normalizeRemoteConversations,
  normalizeRemoteMessages,
  stripRendered,
} from '~/utils/mknowHelpers';

/**
 * m知道：历史会话列表 / 切换 / 删除 / 新建
 * 依赖页面或其它 behavior：scrollToBottom、onShowToast
 */
const mknowHistoryBehavior = Behavior({
  data: {
    showHistory: false,
    conversations: [],
    historyGroups: [],
    historyKeyword: '',
    historySearchFocus: false,
    activeConversationId: '',
  },

  methods: {
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
     */
    async refreshHistoryList(options = {}) {
      const { fetchRemote = false } = options;
      let conversations = listConversations();
      if (fetchRemote && hasLoginToken()) {
        this._historyFetchId = (this._historyFetchId || 0) + 1;
        const reqId = this._historyFetchId;
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
          handleApiError(err, { fallbackMessage: '历史消息加载失败，已尝试本地记录' });
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
          handleApiError(err, { fallbackMessage: '删除失败，请稍后重试' });
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
      if (e.stopPropagation) e.stopPropagation();

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
  },
});

export default mknowHistoryBehavior;
