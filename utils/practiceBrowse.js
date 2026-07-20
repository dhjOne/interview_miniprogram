import { practiceApi } from '~/api/index';
import { questionApi } from '~/api/index';
import {
  getQuestionBrowseHistory,
  recordQuestionBrowse
} from '~/utils/questionBrowseHistory';
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

function toQuestionId(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function toViewedAtTs(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const ts = Date.parse(String(value).replace(/-/g, '/').replace('T', ' '));
  return Number.isNaN(ts) ? 0 : ts;
}

/**
 * 合并云端 + 本机浏览历史（同题去重，取较新时间）
 */
export function mergeBrowseHistory(serverRows, localRows) {
  const map = new Map();

  (serverRows || []).forEach((row) => {
    const id = String(row.questionId ?? row.question_id ?? row.id ?? '');
    if (!id) return;
    map.set(id, {
      questionId: id,
      id,
      title: row.title || '无标题',
      categoryName: row.categoryName ?? row.category_name ?? '',
      viewedAt: row.viewedAt ?? row.viewed_at
    });
  });

  (localRows || []).forEach((row) => {
    const id = String(row.id ?? row.questionId ?? '');
    if (!id) return;
    const prev = map.get(id);
    const localTs = toViewedAtTs(row.viewedAt);
    const prevTs = toViewedAtTs(prev && prev.viewedAt);
    if (!prev || localTs >= prevTs) {
      map.set(id, {
        questionId: id,
        id,
        title: (row.title && String(row.title).trim()) || (prev && prev.title) || '无标题',
        categoryName: (prev && prev.categoryName) || '',
        viewedAt: row.viewedAt || (prev && prev.viewedAt)
      });
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => toViewedAtTs(b.viewedAt) - toViewedAtTs(a.viewedAt)
  );
}

/**
 * 记录题目浏览：本地历史 + 服务端刷题统计（登录时）
 */
export async function trackQuestionBrowse(question) {
  if (!question) return;
  if (getLocalSettings().autoRecordPractice === false) return;

  const questionId = toQuestionId(question.id ?? question.questionId);
  if (questionId == null) {
    console.warn('[practiceBrowse] skip track: invalid question id', question);
    return;
  }

  const title = (question.title && String(question.title).trim()) || '无标题';

  // 本机先落库，保证「浏览历史」在云端失败时仍可查
  recordQuestionBrowse({
    id: questionId,
    title
  });

  try {
    if (hasLoginToken()) {
      await practiceApi.recordBrowse({
        toRequestData: () => ({ questionId })
      });
    } else {
      await questionApi.incrementViewCount(questionId);
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

/** 登录态：云端优先，并与本机合并，避免只写了本地却看不到 */
export async function fetchMergedBrowseHistory(page = 1, limit = 100) {
  const localRows = getQuestionBrowseHistory();
  if (!hasLoginToken()) {
    return {
      list: mergeBrowseHistory([], localRows),
      total: localRows.length,
      useServer: false
    };
  }

  try {
    const { list } = await fetchServerBrowseHistory(page, limit);
    const merged = mergeBrowseHistory(list, localRows);
    return {
      list: merged,
      total: merged.length,
      useServer: true
    };
  } catch (e) {
    console.warn('[practiceBrowse] server history failed, use local', e);
    const merged = mergeBrowseHistory([], localRows);
    return {
      list: merged,
      total: merged.length,
      useServer: false,
      serverFailed: true
    };
  }
}

export async function removeServerBrowseHistory(questionId) {
  await practiceApi.removeHistory(questionId);
}

export async function clearServerBrowseHistory() {
  await practiceApi.clearHistory();
}

export { hasLoginToken };
