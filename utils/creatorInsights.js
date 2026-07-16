import { creatorInsightsApi } from '~/api/request/api_creator_insights';
import { formatStatCount } from '~/utils/userSocial';

function pickPayload(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data !== undefined && res.data !== null && typeof res.data === 'object') {
    return res.data;
  }
  return res;
}

function num(v) {
  return Number(v) || 0;
}

/**
 * 拉取创作数据洞察（总览 + 热门 + 趋势）
 */
export async function fetchCreatorInsights({
  topSort = 'view',
  trendMetric = 'like',
  trendRange = '7d'
} = {}) {
  const [overviewRes, topRes, trendRes] = await Promise.all([
    creatorInsightsApi.getOverview(),
    creatorInsightsApi.getTop({ sort: topSort, limit: 5 }),
    creatorInsightsApi.getTrend({ metric: trendMetric, range: trendRange })
  ]);

  const overview = normalizeOverview(pickPayload(overviewRes) || {});
  const topList = normalizeTopList(pickPayload(topRes));
  const trendList = normalizeTrendList(pickPayload(trendRes));

  return {
    overview,
    topList,
    trendList,
    trendMax: Math.max(1, ...trendList.map((p) => p.value))
  };
}

export function normalizeOverview(raw = {}) {
  const totalViews = num(raw.totalViews);
  const totalLikes = num(raw.totalLikes);
  const totalCollects = num(raw.totalCollects);
  const totalComments = num(raw.totalComments);
  const totalShares = num(raw.totalShares);
  const publishCount = num(raw.publishCount);
  const featuredCount = num(raw.featuredCount);
  const draftCount = num(raw.draftCount);
  const progressCount = num(raw.progressCount);
  const offlineCount = num(raw.offlineCount);
  const rejectedCount = num(raw.rejectedCount);
  const allCount = num(raw.allCount);
  const followerCount = num(raw.followerCount);
  const visitCount = num(raw.visitCount);
  const myRank = num(raw.myRank);

  return {
    totalViews,
    totalLikes,
    totalCollects,
    totalComments,
    totalShares,
    publishCount,
    featuredCount,
    draftCount,
    progressCount,
    offlineCount,
    rejectedCount,
    allCount,
    followerCount,
    visitCount,
    myRank,
    displayViews: formatStatCount(totalViews),
    displayLikes: formatStatCount(totalLikes),
    displayCollects: formatStatCount(totalCollects),
    displayComments: formatStatCount(totalComments),
    displayShares: formatStatCount(totalShares),
    displayPublish: formatStatCount(publishCount),
    displayFeatured: formatStatCount(featuredCount),
    displayFollowers: formatStatCount(followerCount),
    displayVisits: formatStatCount(visitCount),
    displayRank: myRank > 0 ? `${myRank}` : '—'
  };
}

function normalizeTopList(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload?.list || payload?.rows || payload?.records || [];
  return rows.map((row, index) => ({
    id: row.id,
    title: row.title || '未命名题目',
    viewCount: num(row.viewCount ?? row.view_count),
    likeCount: num(row.likeCount ?? row.like_count),
    collectCount: num(row.collectCount ?? row.collect_count),
    commentCount: num(row.commentCount ?? row.comment_count),
    rank: index + 1,
    displayViews: formatStatCount(num(row.viewCount ?? row.view_count)),
    displayLikes: formatStatCount(num(row.likeCount ?? row.like_count))
  }));
}

function normalizeTrendList(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload?.list || payload?.rows || [];
  return rows.map((row) => {
    const date = String(row.date || '');
    const value = num(row.value);
    const md = date.length >= 10 ? date.slice(5) : date;
    return {
      date,
      label: md,
      value,
      displayValue: formatStatCount(value)
    };
  });
}

export { formatStatCount };
