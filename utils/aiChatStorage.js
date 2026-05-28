const CONVS_KEY = 'mknow_conversations_v2';
const LEGACY_MESSAGES_KEY = 'mknow_chat_messages';
const LEGACY_SESSION_KEY = 'mknow_session_id';
const PENDING_PUBLISH_KEY = 'mknow_pending_publish';

const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONV = 50;

function createSessionId() {
  return `mknow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function resolveRemoteId(conv = {}) {
  return conv.conversationId || conv.id || conv.sessionId || createConversationId();
}

function deriveTitle(messages) {
  const firstUser = (messages || []).find((m) => m.role === 'user' && m.content);
  if (!firstUser) return '新对话';
  const text = String(firstUser.content).trim();
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loadStore() {
  try {
    const raw = wx.getStorageSync(CONVS_KEY);
    if (raw && Array.isArray(raw.conversations) && raw.conversations.length) {
      return raw;
    }
  } catch (e) {
    // ignore
  }
  return migrateLegacyStore();
}

function saveStore(store) {
  try {
    const conversations = (store.conversations || []).slice(0, MAX_CONVERSATIONS);
    wx.setStorageSync(CONVS_KEY, {
      activeId: store.activeId,
      conversations,
    });
  } catch (e) {
    // ignore quota
  }
}

function migrateLegacyStore() {
  let legacyMessages = [];
  let legacySessionId = '';
  try {
    const raw = wx.getStorageSync(LEGACY_MESSAGES_KEY);
    legacyMessages = Array.isArray(raw) ? raw : [];
    legacySessionId = wx.getStorageSync(LEGACY_SESSION_KEY) || '';
  } catch (e) {
    // ignore
  }

  const id = createConversationId();
  const store = {
    activeId: id,
    conversations: [
      {
        id,
        title: deriveTitle(legacyMessages),
        updatedAt: legacyMessages.length
          ? legacyMessages[legacyMessages.length - 1].time || Date.now()
          : Date.now(),
        updatedAtText: '',
        sessionId: legacySessionId || createSessionId(),
        messages: legacyMessages.slice(-MAX_MESSAGES_PER_CONV),
      },
    ],
  };

  if (legacyMessages.length) {
    saveStore(store);
    try {
      wx.removeStorageSync(LEGACY_MESSAGES_KEY);
      wx.removeStorageSync(LEGACY_SESSION_KEY);
    } catch (e) {
      // ignore
    }
  }

  return store;
}

function ensureActiveConversation(store) {
  if (!store.conversations.length) {
    const id = createConversationId();
    store.conversations.push({
      id,
      title: '新对话',
      updatedAt: Date.now(),
      updatedAtText: formatTime(Date.now()),
      sessionId: createSessionId(),
      messages: [],
    });
    store.activeId = id;
    saveStore(store);
  }
  if (!store.activeId || !store.conversations.find((c) => c.id === store.activeId)) {
    store.activeId = store.conversations[0].id;
    saveStore(store);
  }
  return store;
}

function getActiveConv(store) {
  return store.conversations.find((c) => c.id === store.activeId);
}

function decorateConversation(conv) {
  const messages = conv.messages || [];
  const localCount = messages.filter((m) => !m.pending).length;
  const remoteCount = Number(conv.remoteMessageCount) || 0;
  const previewMsg = messages.find((m) => m.role === 'user' && m.content);
  const remotePreview =
    conv.preview && conv.preview !== '暂无消息' ? String(conv.preview).slice(0, 40) : '';
  return {
    ...conv,
    title: conv.title || deriveTitle(messages),
    updatedAtText: formatTime(conv.updatedAt),
    messageCount: Math.max(localCount, remoteCount),
    preview: previewMsg
      ? String(previewMsg.content).slice(0, 40)
      : remotePreview || '暂无消息',
  };
}

/** @deprecated 兼容旧调用 */
export function getSessionId() {
  const store = ensureActiveConversation(loadStore());
  const conv = getActiveConv(store);
  return conv ? conv.sessionId : createSessionId();
}

/** @deprecated 兼容旧调用 */
export function resetSessionId() {
  const store = ensureActiveConversation(loadStore());
  const conv = getActiveConv(store);
  if (conv) {
    conv.sessionId = createSessionId();
    saveStore(store);
    return conv.sessionId;
  }
  return createSessionId();
}

export function loadMessages() {
  const store = ensureActiveConversation(loadStore());
  const conv = getActiveConv(store);
  return conv && Array.isArray(conv.messages) ? conv.messages : [];
}

export function saveMessages(messages) {
  const store = ensureActiveConversation(loadStore());
  const conv = getActiveConv(store);
  if (!conv) return;

  const trimmed = (messages || []).slice(-MAX_MESSAGES_PER_CONV);
  conv.messages = trimmed;
  conv.updatedAt = trimmed.length ? trimmed[trimmed.length - 1].time || Date.now() : Date.now();
  conv.title = deriveTitle(trimmed);
  conv.updatedAtText = formatTime(conv.updatedAt);

  store.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  saveStore(store);
}

export function clearMessages() {
  saveMessages([]);
}

export function listConversations() {
  const store = ensureActiveConversation(loadStore());
  return store.conversations
    .map(decorateConversation)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getActiveConversationId() {
  return ensureActiveConversation(loadStore()).activeId;
}

export function switchConversation(conversationId) {
  const store = ensureActiveConversation(loadStore());
  const target = store.conversations.find((c) => c.id === conversationId);
  if (!target) return null;

  store.activeId = conversationId;
  saveStore(store);
  return {
    messages: target.messages || [],
    sessionId: target.sessionId,
    title: target.title,
  };
}

export function createConversation() {
  const store = ensureActiveConversation(loadStore());
  const active = getActiveConv(store);
  if (active && !(active.messages || []).length) {
    return {
      messages: [],
      sessionId: active.sessionId,
      conversationId: active.id,
      isExistingEmpty: true,
    };
  }

  const id = createConversationId();
  const conv = {
    id,
    title: '新对话',
    updatedAt: Date.now(),
    updatedAtText: formatTime(Date.now()),
    sessionId: createSessionId(),
    messages: [],
  };

  store.conversations.unshift(conv);
  store.activeId = id;
  if (store.conversations.length > MAX_CONVERSATIONS) {
    store.conversations = store.conversations.slice(0, MAX_CONVERSATIONS);
  }
  saveStore(store);

  return {
    messages: [],
    sessionId: conv.sessionId,
    conversationId: id,
    isExistingEmpty: false,
  };
}

export function deleteConversation(conversationId) {
  const store = ensureActiveConversation(loadStore());
  const idx = store.conversations.findIndex((c) => c.id === conversationId);
  if (idx < 0) return null;

  store.conversations.splice(idx, 1);

  if (!store.conversations.length) {
    const id = createConversationId();
    const conv = {
      id,
      title: '新对话',
      updatedAt: Date.now(),
      updatedAtText: formatTime(Date.now()),
      sessionId: createSessionId(),
      messages: [],
    };
    store.conversations.push(conv);
    store.activeId = id;
    saveStore(store);
    return {
      messages: [],
      sessionId: conv.sessionId,
      conversationId: id,
    };
  }

  if (store.activeId === conversationId) {
    store.activeId = store.conversations[0].id;
  }
  saveStore(store);

  const active = getActiveConv(store);
  return {
    messages: active ? active.messages || [] : [],
    sessionId: active ? active.sessionId : createSessionId(),
    conversationId: store.activeId,
  };
}

export function saveRemoteConversation(remoteConv = {}, messages) {
  const store = ensureActiveConversation(loadStore());
  const id = resolveRemoteId(remoteConv);
  const sessionId = remoteConv.sessionId || remoteConv.conversationId || id;
  const idx = store.conversations.findIndex((c) => c.id === id || c.sessionId === sessionId);
  const now = Date.now();
  const existing = idx >= 0 ? store.conversations[idx] : null;
  const nextMessages = Array.isArray(messages)
    ? messages.slice(-MAX_MESSAGES_PER_CONV)
    : existing && Array.isArray(existing.messages)
      ? existing.messages
      : [];
  const conv = {
    ...(existing || {}),
    id,
    sessionId,
    title: remoteConv.title || deriveTitle(nextMessages),
    preview: remoteConv.preview,
    updatedAt: remoteConv.updatedAt || now,
    updatedAtText: formatTime(remoteConv.updatedAt || now),
    messages: nextMessages,
    remote: true,
  };

  if (idx >= 0) {
    store.conversations[idx] = conv;
  } else {
    store.conversations.unshift(conv);
  }
  store.activeId = id;
  store.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  saveStore(store);
  return {
    messages: conv.messages,
    sessionId: conv.sessionId,
    conversationId: conv.id,
    title: conv.title,
  };
}

export function mergeRemoteConversations(remoteConversations = []) {
  const store = ensureActiveConversation(loadStore());
  remoteConversations.forEach((remoteConv) => {
    const id = resolveRemoteId(remoteConv);
    const sessionId = remoteConv.sessionId || remoteConv.conversationId || id;
    const idx = store.conversations.findIndex((c) => c.id === id || c.sessionId === sessionId);
    const existing = idx >= 0 ? store.conversations[idx] : {};
    const remoteMessageCount = Number(remoteConv.messageCount) || Number(existing.remoteMessageCount) || 0;
    const conv = {
      ...existing,
      id,
      sessionId,
      title: remoteConv.title || existing.title || '新对话',
      preview: remoteConv.preview || existing.preview,
      updatedAt: remoteConv.updatedAt || existing.updatedAt || Date.now(),
      updatedAtText: formatTime(remoteConv.updatedAt || existing.updatedAt || Date.now()),
      messages: Array.isArray(existing.messages) ? existing.messages : [],
      remoteMessageCount,
      remote: true,
    };
    if (idx >= 0) {
      store.conversations[idx] = conv;
    } else {
      store.conversations.push(conv);
    }
  });
  store.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  saveStore(store);
  return listConversations();
}

export function messagesToMarkdown(messages, options = {}) {
  const { title: customTitle } = options;
  const list = (messages || []).filter((m) => m.content && !m.pending);
  if (!list.length) return { title: '', content: '' };

  const firstUser = list.find((m) => m.role === 'user');
  const title =
    customTitle ||
    (firstUser
      ? String(firstUser.content).trim().slice(0, 30) +
        (String(firstUser.content).trim().length > 30 ? '…' : '')
      : 'AI 对话整理');

  const lines = [
    `# ${title}`,
    '',
    `> 由 m知道 AI 对话整理 · ${formatTime(Date.now())}`,
    '',
  ];

  list.forEach((m) => {
    if (m.role === 'user') {
      lines.push('## 提问', '', String(m.content).trim(), '');
    } else if (m.role === 'assistant') {
      lines.push('## 回答', '', String(m.content).trim(), '');
    }
  });

  return { title, content: lines.join('\n').trim() };
}

export function setPendingPublish(payload) {
  try {
    wx.setStorageSync(PENDING_PUBLISH_KEY, {
      ...payload,
      timestamp: Date.now(),
    });
  } catch (e) {
    // ignore
  }
}

export function consumePendingPublish() {
  try {
    const raw = wx.getStorageSync(PENDING_PUBLISH_KEY);
    wx.removeStorageSync(PENDING_PUBLISH_KEY);
    return raw || null;
  } catch (e) {
    return null;
  }
}
