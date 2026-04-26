import { authApi } from '~/api/request/api_question';
import { PracticeRankingParams } from '~/api/param/param_question';

const app = getApp();

function pickRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return payload.rows || payload.list || payload.records || [];
}

function pickMyRankInfo(payload, appUser) {
  if (!payload || typeof payload !== 'object') return null;
  const self =
    payload.myRankInfo ||
    payload.my ||
    payload.self ||
    (payload.mine);
  if (self && (self.rank != null || self.practiceCount != null || self.count != null)) {
    return {
      rank: self.rank ?? self.ranking ?? 0,
      count:
        self.practiceCount ?? self.answerCount ?? self.questionCount ?? self.count ?? self.score ?? 0,
      avatar: self.avatar ?? self.headImg,
      nickname: self.nickname ?? self.name
    };
  }
  if (payload.myRank != null) {
    const u = appUser || {};
    return {
      rank: payload.myRank,
      count: payload.myPracticeCount ?? payload.myAnswerCount ?? 0,
      avatar: u.avatar || u.headImg,
      nickname: u.nickname || u.name || '我'
    };
  }
  return null;
}

function normalizeRankRow(row, index) {
  const rank = row.rank ?? row.ranking ?? row.sort ?? index + 1;
  const nickname = row.nickname ?? row.name ?? row.userName ?? '用户';
  const avatar = row.avatar ?? row.headImg ?? row.avatarUrl ?? '';
  const count = Number(
    row.practiceCount ?? row.answerCount ?? row.questionCount ?? row.score ?? row.count ?? 0
  );
  const uid = row.userId ?? row.user_id ?? row.id ?? `idx-${index}`;
  const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-n';
  return {
    ...row,
    rank,
    nickname,
    avatar,
    count,
    rankClass,
    rid: String(uid)
  };
}

Page({
  data: {
    rankList: [],
    myRankInfo: null,
    hasMore: true,
    page: 1,
    pageSize: 30,
    loading: false,
    loadDone: false,
    loadError: false,
    errorMessage: '',
    defaultAvatar: '/static/avatar1.png'
  },

  onShow() {},

  onLoad() {
    this.reload();
  },

  onReachBottom() {
    this.fetchRank(false);
  },

  reload() {
    this.setData(
      {
        rankList: [],
        myRankInfo: null,
        page: 0,
        hasMore: true,
        loadError: false,
        errorMessage: '',
        loadDone: false
      },
      () => {
        this.fetchRank(true);
      }
    );
  },

  async fetchRank(isRefresh) {
    if (this.data.loading) return;
    if (!isRefresh && !this.data.hasMore) return;

    const nextPage = isRefresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const params = new PracticeRankingParams(nextPage, this.data.pageSize);
      const resBody = await authApi.getPracticeRanking(params);
      const data = resBody && resBody.data !== undefined && resBody.data !== null ? resBody.data : resBody;
      const rawList = pickRows(data);
      const appUser = app.getUserInfo();
      const mergedForPick = { ...(data || {}), myRank: (data && data.myRank) != null ? data.myRank : resBody.myRank };
      const myRankInfo = pickMyRankInfo(mergedForPick, appUser);
      const startIdx = (nextPage - 1) * this.data.pageSize;
      const normalized = rawList.map((r, i) => normalizeRankRow(r, startIdx + i));
      const total = (data && data.total) != null ? data.total : undefined;
      const merged = isRefresh ? normalized : [...this.data.rankList, ...normalized];
      const hasMore =
        typeof total === 'number' ? merged.length < total : normalized.length >= this.data.pageSize;

      this.setData({
        rankList: merged,
        page: nextPage,
        hasMore,
        myRankInfo,
        loadDone: true,
        loadError: false
      });
    } catch (e) {
      console.error('刷题榜加载失败:', e);
      const msg = (e && (e.message || e.msg)) || '';
      this.setData({
        loadError: !!isRefresh,
        errorMessage: msg || '服务暂不可用',
        loadDone: true
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  goCategory() {
    wx.switchTab({
      url: '/pages/category/index',
      fail: (err) => {
        console.error('switchTab fail', err);
        wx.navigateTo({ url: '/pages/category/index' });
      }
    });
  }
});
