const { renderMarkdown: renderMarkdownAsync } = require('./towxmlLoader');

const MODEL_KEY = 'mknow_selected_model_key';
export const DEFAULT_MODEL_OPTIONS = [{ key: 'auto', label: 'Auto', provider: 'auto', auto: true }];

export function createMessage(role, content, extra = {}) {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    time: Date.now(),
    ...extra,
  };
}

export function hydrateMessages(messages = []) {
  return Promise.all(
    (messages || []).map(async (m) => {
      if (m.role !== 'assistant' || !m.content || m.renderedContent) return m;
      const renderedContent = await renderMarkdownAsync(m.content);
      return { ...m, renderedContent };
    }),
  );
}

export function stripRendered(messages = []) {
  return messages.map(({ renderedContent, ...rest }) => rest);
}

export function extractReplyText(res) {
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

export function extractSources(res) {
  const data = res && res.data != null ? res.data : res;
  return Array.isArray(data && data.sources) ? data.sources : [];
}

export function extractErrorType(res) {
  const data = res && res.data != null ? res.data : res;
  return data && data.errorType ? data.errorType : '';
}

export function hasLoginToken() {
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

export function pickRows(res) {
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

export function normalizeRemoteConversations(res) {
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

export async function normalizeRemoteMessages(res) {
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

export function normalizeModelOptions(res) {
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

export function groupModelOptions(modelOptions = []) {
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

export function filterModelOptions(modelOptions = [], keyword = '') {
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

export function getStoredModelKey() {
  try {
    return wx.getStorageSync(MODEL_KEY) || 'auto';
  } catch (e) {
    return 'auto';
  }
}

export function saveStoredModelKey(modelKey) {
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

export function groupConversationsByTime(conversations) {
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

export function buildHistoryGroups(conversations, keyword, activeId) {
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
export function getNavContentHeight() {
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

export function buildFallbackReply(question) {
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
