/**
 * 登录前暂存的互动意图：登录成功回到原页后自动续做。
 * 仅存本地，TTL 内有效。
 */

const STORAGE_KEY = 'pending_login_action';
const TTL_MS = 10 * 60 * 1000;

/**
 * @typedef {Object} PendingLoginAction
 * @property {string} type
 * @property {string} [page]
 * @property {string} [questionId]
 * @property {Object} [payload]
 * @property {number} [createdAt]
 */

export function setPendingLoginAction(action) {
  if (!action || !action.type) return;
  try {
    wx.setStorageSync(STORAGE_KEY, {
      ...action,
      createdAt: Date.now(),
    });
  } catch (e) {
    console.warn('[pendingAction] set failed', e);
  }
}

export function clearPendingLoginAction() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

export function peekPendingLoginAction() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object' || !raw.type) return null;
    if (Date.now() - (Number(raw.createdAt) || 0) > TTL_MS) {
      clearPendingLoginAction();
      return null;
    }
    return raw;
  } catch (e) {
    return null;
  }
}

/**
 * 取出并清除；可选 predicate，不匹配则放回并返回 null
 * @param {(action: PendingLoginAction) => boolean} [predicate]
 */
export function consumePendingLoginAction(predicate) {
  const action = peekPendingLoginAction();
  if (!action) return null;
  if (typeof predicate === 'function' && !predicate(action)) {
    return null;
  }
  clearPendingLoginAction();
  return action;
}

/** 互动文案 */
export const ACTION_LOGIN_HINTS = {
  like: '登录后即可点赞本题',
  collect: '登录后即可收藏本题',
  follow: '登录后即可关注作者',
  comment_submit: '登录后即可发表评论',
  comment_like: '登录后即可为评论点赞',
  comment_reply: '登录后即可回复评论',
  comment_report: '登录后即可举报评论',
  report_question: '登录后即可举报题目',
  report_author: '登录后即可举报作者',
  block_author: '登录后即可拉黑作者',
  memo: '登录后即可记到面试速记',
};

/** 登录回跳自动续做成功后的反馈文案 */
export const ACTION_RESUME_TOASTS = {
  like: '已为你完成点赞',
  collect: '登录成功，请选择收藏分类',
  follow: '已为你关注作者',
  comment_submit: '已为你发表评论',
  comment_like: '已为你点赞该评论',
  comment_reply: '登录成功，可以继续回复了',
  comment_report: '已为你打开举报',
  report_question: '已为你提交举报',
  report_author: '已为你提交举报',
  block_author: '登录成功，可继续操作',
  memo: '登录成功，正在打开速记',
};
