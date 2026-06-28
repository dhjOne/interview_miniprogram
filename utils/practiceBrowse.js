import { practiceApi } from '~/api/request/api_practice';
import { authApi } from '~/api/request/api_question';
import { recordQuestionBrowse } from '~/utils/questionBrowseHistory';
import { getLocalSettings } from '~/utils/userSettings';

function hasLoginToken() {
  try {
    return !!wx.getStorageSync('access_token');
  } catch (e) {
    return false;
  }
}

function pickPayload(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data !== undefined && res.data !== null) return res.data;
  return res;
}

function pickRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return payload.rows || payload.list || payload.records || [];
}

/**
 * 记录题目浏览：本地历史 + 服务端刷题统计（登录时）
 */
export async function trackQuestionBrowse(question) {
  if (!question || question.id == null) return;
  if (getLocalSettings().autoRecordPractice === false) return;

  recordQuestionBrowse({
    id: question.id,
    title: question.title
  });

  try {
    if (hasLoginToken()) {
      await practiceApi.recordBrowse({
        toRequestData: () => ({ questionId: Number(question.id) })
      });
    } else {
      await authApi.incrementViewCount(question.id);
    }
  } catch (e) {
    console.warn('[practiceBrowse] track failed', e);
  }
}

export async function fetchServerBrowseHistory(page = 1, limit = 50) {
  const res = await practiceApi.getHistory({ page, limit });
  const payload = pickPayload(res) || {};
  const rows = pickRows(payload);
  const total = payload.total ?? rows.length;
  return { list: rows, total };
}

export async function removeServerBrowseHistory(questionId) {
  await practiceApi.removeHistory(questionId);
}

export async function clearServerBrowseHistory() {
  await practiceApi.clearHistory();
}

export { hasLoginToken };
