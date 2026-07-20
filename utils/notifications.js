/**
 * 社交通知：分类、展示归一化、跳转映射
 */
import { openPage } from './router';

export const NOTIFY_TABS = [
  { label: '全部', value: 'all' },
  { label: '互动', value: 'interact' },
  { label: '审核', value: 'audit' },
  { label: '系统', value: 'system' }
];

const DEFAULT_AVATAR = '/static/avatar1.png';

const TYPE_META = {
  SOCIAL_FOLLOW: { category: 'interact', icon: 'user-add', tone: 'blue', label: '关注' },
  QUESTION_LIKE: { category: 'interact', icon: 'thumb-up', tone: 'rose', label: '点赞' },
  QUESTION_COLLECT: { category: 'interact', icon: 'heart', tone: 'rose', label: '收藏' },
  QUESTION_COMMENT: { category: 'interact', icon: 'chat', tone: 'blue', label: '评论' },
  COMMENT_LIKE: { category: 'interact', icon: 'thumb-up', tone: 'rose', label: '赞评' },
  PROFILE_AUDIT: { category: 'audit', icon: 'secured', tone: 'amber', label: '资料' },
  QUESTION_AUDIT: { category: 'audit', icon: 'file', tone: 'amber', label: '审核' },
  SOCIAL_REPORT_RESULT: { category: 'system', icon: 'info-circle', tone: 'slate', label: '举报' },
  SOCIAL_WARNING: { category: 'system', icon: 'error-circle', tone: 'orange', label: '提醒' },
  ACCOUNT_STATUS: { category: 'system', icon: 'usergroup', tone: 'orange', label: '账号' },
  POINT_APPEAL: { category: 'system', icon: 'wallet', tone: 'slate', label: '积分' }
};

export function pickNotificationUnread(res) {
  const data = (res && res.data) || res || {};
  const raw =
    data.unreadCount ??
    data.unreadTotal ??
    data.unread ??
    data.count ??
    0;
  return Math.max(0, Number(raw) || 0);
}

export function normalizeNotificationRow(item) {
  const type = String(item.type || '');
  const meta = TYPE_META[type] || {
    category: item.category || 'system',
    icon: 'notification',
    tone: 'slate',
    label: '通知'
  };
  const actorNickname = item.actorNickname || item.actorName || '';
  const actorAvatar = item.actorAvatar || item.avatar || '';
  const hasActor = !!(item.actorId || actorNickname || actorAvatar);

  return {
    ...item,
    type,
    actorNickname,
    actorAvatar: actorAvatar || DEFAULT_AVATAR,
    hasActor,
    typeIcon: meta.icon,
    typeTone: meta.tone,
    typeLabel: meta.label,
    category: item.category || meta.category,
    displayTitle: actorNickname || item.title || '通知',
    displayContent: item.content || item.title || '你有一条新通知',
    timeText: formatRelativeTime(item.createdAt || item.createTime),
    isRead: item.isRead ? 1 : 0
  };
}

/** 相对时间，接近微信通知体验 */
export function formatRelativeTime(value) {
  if (!value) return '';
  const raw = String(value).trim().replace('T', ' ').replace(/-/g, '/');
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16);
  }
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return '昨天';
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;

  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  const thisYear = new Date().getFullYear();
  if (y === thisYear) return `${m}-${d}`;
  return `${y}-${m}-${d}`;
}

/**
 * 按 type / target 跳转；返回是否发生了页面跳转
 */
export function navigateByNotification(item) {
  if (!item) return false;
  const type = String(item.type || '');
  const targetType = String(item.targetType || '').toUpperCase();
  const targetId = item.targetId;
  const actorId = item.actorId;

  if (type === 'SOCIAL_FOLLOW') {
    const userId = actorId || targetId;
    if (userId) {
      openPage({
        url: `/pages/ucenter/profile/index?userId=${userId}`
      });
      return true;
    }
  }

  if (type === 'PROFILE_AUDIT') {
    openPage({ url: '/pages/my/info-edit/index' });
    return true;
  }

  if (
    type === 'QUESTION_AUDIT' ||
    type === 'QUESTION_LIKE' ||
    type === 'QUESTION_COLLECT' ||
    type === 'QUESTION_COMMENT' ||
    type === 'COMMENT_LIKE'
  ) {
    if (targetId) {
      openPage({
        url: `/pages/question/detail/index?id=${targetId}`
      });
      return true;
    }
  }

  if (type === 'POINT_APPEAL') {
    openPage({ url: '/pages/ucenter/points/appeals/index' });
    return true;
  }

  if (targetType === 'QUESTION' && targetId) {
    openPage({
      url: `/pages/question/detail/index?id=${targetId}`
    });
    return true;
  }

  if (targetType === 'USER' && (actorId || targetId)) {
    openPage({
      url: `/pages/ucenter/profile/index?userId=${actorId || targetId}`
    });
    return true;
  }

  if (type === 'SOCIAL_WARNING' || type === 'ACCOUNT_STATUS' || type === 'SOCIAL_REPORT_RESULT') {
    return false;
  }

  return false;
}
