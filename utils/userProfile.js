import { profileApi, normalizePersonalInfo, unwrapData, socialApi } from '~/api/index';

const app = getApp();
export const DEFAULT_AVATAR = '/static/avatar1.png';

export async function fetchPersonalInfo() {
  const res = await profileApi.getPersonalInfo();
  return normalizePersonalInfo(unwrapData(res));
}

export async function savePersonalInfo(payload) {
  await profileApi.updatePersonalInfo(payload);
  const cached = normalizePersonalInfo({
    ...(app.getUserInfo?.() || wx.getStorageSync('user_info') || {}),
    ...payload
  });
  syncCachedUserInfo(cached);
  return cached;
}

export function syncCachedUserInfo(info) {
  if (!info) return;
  const cached = {
    ...(app.getUserInfo?.() || wx.getStorageSync('user_info') || {}),
    userId: info.userId,
    nickname: info.nickname,
    avatar: info.avatar,
    bio: info.bio,
    phone: info.phone,
    professionCodes: info.professionCodes || []
  };
  if (app.setUserInfo) {
    app.setUserInfo(cached);
  } else {
    wx.setStorageSync('user_info', cached);
  }
}

export function toEditForm(info) {
  const normalized = normalizePersonalInfo(info);
  return {
    nickname: normalized.nickname || '',
    avatar: normalized.avatar || '',
    gender: normalized.gender ?? 2,
    birth: normalized.birth || '',
    address: normalized.address || [],
    addressText: normalized.addressText || '',
    bio: normalized.bio || '',
    photos: normalized.photos || [],
    professionCodes: normalized.professionCodes || []
  };
}

export function toSavePayload(form) {
  return {
    nickname: form.nickname,
    avatar: form.avatar,
    gender: form.gender,
    birth: form.birth,
    address: form.address,
    addressText: form.addressText,
    bio: form.bio,
    photos: form.photos,
    professionCodes: form.professionCodes || []
  };
}

export function normalizeProfileRow(row = {}, fallbackUserId = '') {
  return {
    userId: row.userId || row.user_id || row.id || fallbackUserId,
    nickname: row.nickname || row.username || '用户',
    avatar: row.avatar || row.logo || DEFAULT_AVATAR,
    bio: row.bio || '',
    followingCount: Number(row.followingCount || row.following_count || 0),
    followerCount: Number(row.followerCount || row.follower_count || 0),
    publishCount: Number(row.publishCount || row.publish_count || 0),
    likeCount: Number(row.likeCount || row.like_count || 0),
    visitCount: Number(row.visitCount || row.visit_count || 0),
    isFollowing: !!(row.isFollowing ?? row.following ?? row.followed),
    isBlocked: !!row.isBlocked,
    isBlockedByTarget: !!row.isBlockedByTarget,
    auditStatus: row.auditStatus ?? 1
  };
}

export async function fetchUserProfile(userId) {
  const res = await socialApi.getUserProfile({ userId });
  const profile = normalizeProfileRow(unwrapData(res) || {}, userId);
  return { profile, fromDemo: false };
}

export async function fetchUserQuestions(userId, page = 1, limit = 20) {
  const res = await socialApi.getUserQuestions({ userId, page, limit });
  const data = unwrapData(res) || {};
  const rows = data.rows || data.list || data.records || [];
  const list = rows.map(item => ({
    ...item,
    id: item.id || item.questionId,
    title: item.title || '未命名内容',
    viewCount: item.viewCount || 0,
    likeCount: item.likeCount || 0,
    commentCount: item.commentCount || 0,
    category: item.category || item.categoryCode || 'other',
    displayDate: String(item.createdAt || item.createTime || '').replace('T', ' ').slice(0, 10)
  }));
  return {
    list,
    total: Number(data.total || list.length),
    fromDemo: false
  };
}
