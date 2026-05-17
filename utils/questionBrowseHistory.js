/** 题目浏览历史（本地存储，与账号无关） */
const STORAGE_KEY = 'question_browse_history_v1';
const MAX_ITEMS = 100;

function safeRead() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function safeWrite(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list);
  } catch (e) {
    // 存储满或不可用则忽略
  }
}

/**
 * 记录一次题目浏览（去重：同 id 置顶并更新时间）
 * @param {Object} q 题目对象，需含 id / title
 */
export function recordQuestionBrowse(q) {
  if (!q || q.id == null) return;
  const id = String(q.id);
  const title = (q.title && String(q.title).trim()) || '无标题';
  const viewedAt = Date.now();
  const prev = safeRead();
  const rest = prev.filter((row) => String(row.id) !== id);
  rest.unshift({ id, title, viewedAt });
  safeWrite(rest.slice(0, MAX_ITEMS));
}

export function getQuestionBrowseHistory() {
  return safeRead();
}

export function getQuestionBrowseHistoryCount() {
  return safeRead().length;
}

export function clearQuestionBrowseHistory() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

export function removeQuestionBrowseById(questionId) {
  if (questionId == null) return;
  const id = String(questionId);
  const next = safeRead().filter((row) => String(row.id) !== id);
  safeWrite(next);
}
