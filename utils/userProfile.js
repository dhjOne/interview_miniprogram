import config from '~/config/index';
import { authApi } from '~/api/request/api_question';
import { socialApi } from '~/api/request/api_social';
import { normalizeUserRow } from '~/utils/userSocial';

const DEFAULT_AVATAR = '/static/avatar1.png';

/** 接口未就绪时的默认演示作者 */
export const DEMO_AUTHOR_ID = 'u1';

export function isDemoProfileEnabled() {
  return !!(config.features && config.features.useDemoProfile);
}

const DEMO_PROFILES = {
  u1: {
    userId: 'u1',
    nickname: '面试小能手',
    avatar: '/static/avatar1.png',
    bio: '每天刷题进步一点点，专注 Java 后端与系统设计',
    followingCount: 12,
    followerCount: 38,
    publishCount: 6,
    likeCount: 128
  },
  u2: {
    userId: 'u2',
    nickname: '算法练习生',
    avatar: '/static/avatar1.png',
    bio: '数据结构 & 算法，LeetCode 200+',
    followingCount: 5,
    followerCount: 21,
    publishCount: 4,
    likeCount: 56
  },
  u3: {
    userId: 'u3',
    nickname: '前端追梦人',
    avatar: '/static/avatar1.png',
    bio: 'React、小程序与工程化实践',
    followingCount: 18,
    followerCount: 52,
    publishCount: 8,
    likeCount: 203
  }
};

const DEMO_QUESTIONS = [
  { id: 'q101', title: 'Redis 持久化 RDB 与 AOF 如何选择？', viewCount: 1204, likeCount: 86, commentCount: 12, createdAt: '2025-05-10', category: 'tech' },
  { id: 'q102', title: 'MySQL 索引下推 ICP 原理', viewCount: 892, likeCount: 45, commentCount: 8, createdAt: '2025-05-08', category: 'tech' },
  { id: 'q103', title: '分布式锁 Redisson 实现要点', viewCount: 2103, likeCount: 132, commentCount: 24, createdAt: '2025-05-01', category: 'tech' },
  { id: 'q104', title: 'Spring 循环依赖三级缓存', viewCount: 1560, likeCount: 98, commentCount: 15, createdAt: '2025-04-22', category: 'tech' },
  { id: 'q105', title: '如何高效学习技术', viewCount: 856, likeCount: 62, commentCount: 18, createdAt: '2025-04-15', category: 'life' },
  { id: 'q106', title: '字节跳动三面分享', viewCount: 3204, likeCount: 201, commentCount: 45, createdAt: '2025-04-08', category: 'news' }
];

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

function formatDateYMD(value) {
  if (value === undefined || value === null || value === '') return '—';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const mo = `${m[2]}`.padStart(2, '0');
    const d = `${m[3]}`.padStart(2, '0');
    return `${m[1]}-${mo}-${d}`;
  }
  const d = new Date(s.replace(/-/g, '/'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10) || '—';
  const y = d.getFullYear();
  const mo = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function normalizeProfileRow(row, userId) {
  const uid = row.userId ?? row.user_id ?? row.id ?? userId ?? '';
  return {
    userId: String(uid),
    nickname: row.nickname ?? row.name ?? row.userName ?? '用户',
    avatar: row.avatar ?? row.headImg ?? row.avatarUrl ?? DEFAULT_AVATAR,
    bio: row.bio ?? row.brief ?? row.description ?? row.intro ?? '',
    followingCount: Number(row.followingCount ?? row.following ?? 0),
    followerCount: Number(row.followerCount ?? row.followers ?? row.fansCount ?? 0),
    publishCount: Number(row.publishCount ?? row.articleCount ?? row.postCount ?? 0),
    likeCount: Number(row.likeCount ?? row.totalLikes ?? 0),
    isFollowing: !!(row.isFollowing ?? row.following ?? row.followed)
  };
}

export function normalizeProfileQuestionRow(row) {
  const viewCount = row.viewCount ?? row.view_count ?? 0;
  const commentCount = row.commentCount ?? row.comment_count ?? 0;
  const likeCount = row.likeCount ?? row.like_count ?? 0;
  const rawTime =
    row.updatedAt ?? row.updated_at ?? row.createdAt ?? row.created_at ?? row.createAt;
  return {
    ...row,
    id: row.id ?? row.questionId,
    title: row.title || '无标题',
    viewCount,
    commentCount,
    likeCount,
    displayDate: formatDateYMD(rawTime)
  };
}

export function getDemoProfile(userId = DEMO_AUTHOR_ID) {
  const demo = DEMO_PROFILES[userId] || {
    userId,
    nickname: '题库用户',
    avatar: DEFAULT_AVATAR,
    bio: '这位同学很低调，还没有写简介',
    followingCount: 0,
    followerCount: 0,
    publishCount: DEMO_QUESTIONS.length,
    likeCount: 0,
    isFollowing: false
  };
  return { profile: normalizeProfileRow(demo, userId), fromDemo: true };
}

export function getDemoQuestions(page = 1, pageSize = 20) {
  const start = (page - 1) * pageSize;
  const slice = DEMO_QUESTIONS.slice(start, start + pageSize);
  return {
    list: slice.map(normalizeProfileQuestionRow),
    total: DEMO_QUESTIONS.length,
    fromDemo: true
  };
}

export async function fetchUserProfile(userId) {
  if (isDemoProfileEnabled()) {
    return getDemoProfile(userId);
  }
  try {
    const res = await socialApi.getUserProfile({ userId });
    const data = pickPayload(res);
    if (!data) throw new Error('empty profile');
    return { profile: normalizeProfileRow(data, userId), fromDemo: false };
  } catch (e) {
    console.warn('[userProfile] 资料加载失败，使用演示数据', e);
    const demo = DEMO_PROFILES[userId] || {
      userId,
      nickname: '题库用户',
      avatar: DEFAULT_AVATAR,
      bio: '这位同学很低调，还没有写简介',
      followingCount: 0,
      followerCount: 0,
      publishCount: DEMO_QUESTIONS.length,
      likeCount: 0,
      isFollowing: false
    };
    return { profile: normalizeProfileRow(demo, userId), fromDemo: true };
  }
}

export async function fetchUserQuestions(userId, page = 1, pageSize = 20) {
  if (isDemoProfileEnabled()) {
    return getDemoQuestions(page, pageSize);
  }
  try {
    const res = await socialApi.getUserQuestions({ userId, page, limit: pageSize, pageSize });
    const payload = pickPayload(res);
    const raw = pickRows(payload);
    const total = pickTotal(payload, raw.length);
    const list = raw.map(normalizeProfileQuestionRow);
    return { list, total, fromDemo: false };
  } catch (e) {
    console.warn('[userProfile] 文章列表失败，尝试通用题目接口', e);
    try {
      const fallback = await authApi.getQuestionList({
        userId,
        createId: userId,
        authorId: userId,
        page,
        limit: pageSize
      });
      const payload = pickPayload(fallback);
      const raw = pickRows(payload);
      const total = pickTotal(payload, raw.length);
      if (raw.length) {
        return {
          list: raw.map(normalizeProfileQuestionRow),
          total,
          fromDemo: false
        };
      }
    } catch (err2) {
      console.warn('[userProfile] 通用题目接口亦失败', err2);
    }
    const start = (page - 1) * pageSize;
    const slice = DEMO_QUESTIONS.slice(start, start + pageSize);
    return { list: slice.map(normalizeProfileQuestionRow), total: DEMO_QUESTIONS.length, fromDemo: true };
  }
}

export { normalizeUserRow, DEFAULT_AVATAR };
