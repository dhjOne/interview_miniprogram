import { socialApi } from '~/api/request/api_social';

const DEFAULT_AVATAR = '/static/avatar1.png';

/** 接口不可用时的演示数据，便于联调前预览 UI */
const DEMO_USERS = [
  { userId: 'u1', nickname: '面试小能手', avatar: '/static/avatar1.png', bio: '每天刷题进步一点点' },
  { userId: 'u2', nickname: '算法练习生', avatar: '/static/avatar1.png', bio: '专注数据结构' },
  { userId: 'u3', nickname: '前端追梦人', avatar: '/static/avatar1.png', bio: 'React & 小程序' },
  { userId: 'u4', nickname: '八股文收藏家', avatar: '/static/avatar1.png', bio: '整理高频题' },
  { userId: 'u5', nickname: '深夜刷题党', avatar: '/static/avatar1.png', bio: '坚持就是胜利' }
];

const DEMO_SUMMARY = {
  followingCount: 12,
  followerCount: 38,
  visitCount: 156,
  availablePoints: 1280
};

function pickPayload(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data !== undefined && res.data !== null && typeof res.data === 'object') {
    return res.data;
  }
  return res;
}

function pickRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return payload.rows || payload.list || payload.records || [];
}

function pickTotal(payload, listLen) {
  if (!payload || typeof payload !== 'object') return listLen;
  const t = payload.total ?? payload.count;
  return typeof t === 'number' ? t : listLen;
}

function formatRelativeTime(value) {
  if (value === undefined || value === null || value === '') return '';
  const ts = typeof value === 'number' ? value : Date.parse(String(value).replace(/-/g, '/'));
  if (Number.isNaN(ts)) return String(value).slice(0, 16);
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} 天前`;
  const d = new Date(ts);
  const pad = (n) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function normalizeUserRow(row, index) {
  const userId = row.userId ?? row.user_id ?? row.id ?? `idx-${index}`;
  return {
    ...row,
    userId: String(userId),
    nickname: row.nickname ?? row.name ?? row.userName ?? '用户',
    avatar: row.avatar ?? row.headImg ?? row.avatarUrl ?? DEFAULT_AVATAR,
    bio: row.bio ?? row.brief ?? row.description ?? '',
    timeText: formatRelativeTime(
      row.followedAt ?? row.followAt ?? row.createdAt ?? row.visitAt ?? row.visitedAt ?? row.time
    ),
    isFollowing: !!(row.isFollowing ?? row.following ?? row.followed)
  };
}

function demoList(type, page, pageSize) {
  const base = DEMO_USERS.map((u, i) => ({
    ...u,
    followedAt: Date.now() - (i + 1) * 3600000,
    visitAt: Date.now() - (i + 1) * 7200000,
    isFollowing: type === 'following' ? true : i % 2 === 0
  }));
  const start = (page - 1) * pageSize;
  const slice = base.slice(start, start + pageSize);
  return {
    rows: slice,
    total: base.length
  };
}

const LIST_FETCHERS = {
  following: (params) => socialApi.getFollowingList(params),
  followers: (params) => socialApi.getFollowersList(params),
  visits: (params) => socialApi.getVisitsList(params)
};

/**
 * @param {'following'|'followers'|'visits'} type
 */
export async function fetchSocialList(type, page = 1, pageSize = 20) {
  const fetcher = LIST_FETCHERS[type];
  if (!fetcher) {
    return { list: [], total: 0, fromDemo: false };
  }

  try {
    const res = await fetcher({ page, limit: pageSize, pageSize });
    const payload = pickPayload(res);
    const raw = pickRows(payload);
    const total = pickTotal(payload, raw.length);
    const startIdx = (page - 1) * pageSize;
    const list = raw.map((r, i) => normalizeUserRow(r, startIdx + i));
    return { list, total, fromDemo: false };
  } catch (e) {
    console.warn(`[userSocial] ${type} 列表加载失败，使用演示数据`, e);
    const demo = demoList(type, page, pageSize);
    const startIdx = (page - 1) * pageSize;
    const list = demo.rows.map((r, i) => normalizeUserRow(r, startIdx + i));
    return { list, total: demo.total, fromDemo: true };
  }
}

export async function fetchSocialSummary() {
  try {
    const res = await socialApi.getSummary();
    const data = pickPayload(res) || {};
    return {
      followingCount: Number(data.followingCount ?? data.following ?? data.followCount ?? 0),
      followerCount: Number(data.followerCount ?? data.followers ?? data.fansCount ?? 0),
      visitCount: Number(data.visitCount ?? data.visits ?? data.profileViews ?? 0),
      availablePoints: Number(
        data.availablePoints ?? data.available_points ?? data.points ?? 0
      ),
      fromDemo: false
    };
  } catch (e) {
    console.warn('[userSocial] 统计摘要加载失败，使用演示数据', e);
    return { ...DEMO_SUMMARY, fromDemo: true };
  }
}

export function formatStatCount(n) {
  const num = Number(n) || 0;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return `${num}`;
}

export const SOCIAL_STAT_ITEMS = [
  { type: 'following', label: '关注', url: '/pages/ucenter/following/index' },
  { type: 'followers', label: '粉丝', url: '/pages/ucenter/followers/index' },
  { type: 'visits', label: '访问', url: '/pages/ucenter/visits/index' },
  { type: 'points', label: '积分', url: '/pages/ucenter/points/index', countKey: 'availablePoints' }
];
