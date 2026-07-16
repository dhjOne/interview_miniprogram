import { authApi } from '~/api/request/api_question';
import { DocumentParams } from '~/api/param/param_document';
import { fetchUserProfile } from '~/utils/userProfile';
import { fetchSocialSummary, formatStatCount } from '~/utils/userSocial';

const app = getApp();

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

export function getSelfUserId() {
  const info = app.getUserInfo?.() || wx.getStorageSync('user_info') || {};
  return String(info.userId ?? info.id ?? info.user_id ?? '');
}

/** 按状态拉取发布列表 total；失败返回 null（调用方可隐藏数字） */
export async function fetchPublishTotal(docType = 'all') {
  try {
    const document = new DocumentParams();
    Object.assign(document, {
      docType,
      page: 1,
      limit: 1,
      sortField: 'created_at',
      order: 'desc'
    });
    const res = await authApi.getPublishList(document);
    const payload = pickPayload(res) || {};
    const rows = pickRows(payload);
    return pickTotal(payload, rows.length);
  } catch (e) {
    console.warn('[creatorCenter] getPublishList total failed', docType, e);
    return null;
  }
}

/** 最近已发布作品（最多 limit 条） */
export async function fetchRecentPublished(limit = 3) {
  try {
    const document = new DocumentParams();
    Object.assign(document, {
      docType: 'published',
      page: 1,
      limit,
      sortField: 'created_at',
      order: 'desc'
    });
    const res = await authApi.getPublishList(document);
    const payload = pickPayload(res) || {};
    const rows = pickRows(payload);
    return rows.map((row) => ({
      id: row.id || row.questionId,
      title: row.title || '未命名内容',
      viewCount: Number(row.viewCount ?? row.view_count ?? 0),
      likeCount: Number(row.likeCount ?? row.like_count ?? 0),
      displayDate: String(row.updatedAt || row.createdAt || row.createAt || '')
        .replace('T', ' ')
        .slice(0, 10)
    }));
  } catch (e) {
    console.warn('[creatorCenter] recent published failed', e);
    return [];
  }
}

/**
 * 「我的」页入口卡轻量预览：作品 / 获赞 / 草稿
 */
export async function fetchCreatorPreview() {
  const userId = getSelfUserId();
  const [profileRes, draftCount] = await Promise.all([
    userId ? fetchUserProfile(userId).catch(() => null) : Promise.resolve(null),
    fetchPublishTotal('draft')
  ]);
  const profile = profileRes?.profile || {};
  return {
    publishCount: Number(profile.publishCount || 0),
    likeCount: Number(profile.likeCount || 0),
    draftCount
  };
}

/**
 * 创作中心概览：作品/获赞/粉丝/访问 + 各状态数量
 */
export async function fetchCreatorOverview() {
  const userId = getSelfUserId();
  const empty = {
    publishCount: 0,
    likeCount: 0,
    followerCount: 0,
    visitCount: 0,
    draftCount: null,
    progressCount: null,
    publishedCount: null,
    allCount: null
  };

  const [profileRes, summary, draftCount, progressCount, publishedCount, allCount] =
    await Promise.all([
      userId
        ? fetchUserProfile(userId).catch(() => null)
        : Promise.resolve(null),
      fetchSocialSummary().catch(() => null),
      fetchPublishTotal('draft'),
      fetchPublishTotal('progress'),
      fetchPublishTotal('published'),
      fetchPublishTotal('all')
    ]);

  const profile = profileRes?.profile || {};
  return {
    publishCount: Number(profile.publishCount || publishedCount || 0),
    likeCount: Number(profile.likeCount || 0),
    followerCount: Number(
      (summary && summary.followerCount) ?? profile.followerCount ?? 0
    ),
    visitCount: Number((summary && summary.visitCount) ?? profile.visitCount ?? 0),
    draftCount,
    progressCount,
    publishedCount,
    allCount: allCount ?? empty.allCount,
    displayPublish: formatStatCount(Number(profile.publishCount || publishedCount || 0)),
    displayLike: formatStatCount(Number(profile.likeCount || 0)),
    displayFollower: formatStatCount(
      Number((summary && summary.followerCount) ?? profile.followerCount ?? 0)
    ),
    displayVisit: formatStatCount(
      Number((summary && summary.visitCount) ?? profile.visitCount ?? 0)
    )
  };
}

export { formatStatCount };
