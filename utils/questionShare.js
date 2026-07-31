import { questionApi, unwrapData } from '~/api/index';
import { resolveCurrentUserId } from '~/utils/author';

export const SHARE_CHANNEL = {
  FRIEND: 'friend',
  TIMELINE: 'timeline',
  COPY: 'copy',
  UNKNOWN: 'unknown',
};

export const SHARE_ACTION = {
  INITIATE: 'initiate',
  OPEN: 'open',
};

const CHANNEL_SET = new Set(Object.values(SHARE_CHANNEL));

export function normalizeShareChannel(value) {
  const channel = String(value || '')
    .trim()
    .toLowerCase();
  return CHANNEL_SET.has(channel) ? channel : SHARE_CHANNEL.UNKNOWN;
}

function toOptionalNumberId(value) {
  if (value == null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * 构造带归因参数的题目详情 path（不含开头 /，符合微信分享约定）
 */
export function buildQuestionSharePath({
  questionId,
  channel = SHARE_CHANNEL.FRIEND,
  sharerId,
} = {}) {
  const id = questionId != null && questionId !== '' ? String(questionId) : '';
  if (!id) return 'pages/question/index';

  const parts = [
    `id=${encodeURIComponent(id)}`,
    'from=share',
    `channel=${encodeURIComponent(normalizeShareChannel(channel))}`,
  ];
  const uid = sharerId != null && sharerId !== '' ? String(sharerId) : resolveCurrentUserId();
  if (uid) {
    parts.push(`sharerId=${encodeURIComponent(uid)}`);
  }
  return `pages/question/detail/index?${parts.join('&')}`;
}

export function buildQuestionShareMessage({
  title,
  questionId,
  channel = SHARE_CHANNEL.FRIEND,
} = {}) {
  const shareTitle = (title && String(title).trim()) || '面试题分享';
  return {
    title: shareTitle,
    path: buildQuestionSharePath({ questionId, channel }),
  };
}

export function buildQuestionShareTimeline({ title, questionId } = {}) {
  const shareTitle = (title && String(title).trim()) || '面试题分享';
  const query =
    buildQuestionSharePath({
      questionId,
      channel: SHARE_CHANNEL.TIMELINE,
    }).split('?')[1] || '';
  return {
    title: shareTitle,
    query,
  };
}

/**
 * 上报分享行为；失败仅打日志，不打断用户流程
 * @returns {Promise<{ ok: boolean, shareCount: number|null }>}
 */
export async function trackQuestionShare({
  questionId,
  channel = SHARE_CHANNEL.UNKNOWN,
  action = SHARE_ACTION.INITIATE,
  sharerId,
} = {}) {
  const id = questionId != null && questionId !== '' ? String(questionId) : '';
  if (!id) return { ok: false, shareCount: null };

  const body = {
    channel: normalizeShareChannel(channel),
    action: action === SHARE_ACTION.OPEN ? SHARE_ACTION.OPEN : SHARE_ACTION.INITIATE,
  };
  const sharerNum = toOptionalNumberId(sharerId);
  if (sharerNum != null) {
    body.sharerId = sharerNum;
  }

  try {
    const res = await questionApi.reportShare(id, body);
    const data = unwrapData(res) || {};
    const shareCount =
      data.shareCount != null && data.shareCount !== '' ? Number(data.shareCount) || 0 : null;
    return { ok: true, shareCount };
  } catch (e) {
    console.warn('[questionShare] report failed', e);
    return { ok: false, shareCount: null };
  }
}

/**
 * 解析分享回流入口参数
 */
export function parseShareEntry(options = {}) {
  const from = String(options.from || '')
    .trim()
    .toLowerCase();
  if (from !== 'share') return null;
  return {
    from: 'share',
    channel: normalizeShareChannel(options.channel),
    sharerId: options.sharerId != null && options.sharerId !== '' ? String(options.sharerId) : '',
  };
}
