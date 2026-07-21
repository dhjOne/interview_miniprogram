import { practiceApi } from '~/api/index';
import { PracticeRankingParams } from '~/api/param/param_question';
import { openPage } from '~/utils/router';

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
    payload.mine;
  if (self && (self.rank != null || self.practiceCount != null || self.count != null)) {
    return {
      rank: self.rank ?? self.ranking ?? 0,
      count:
        self.practiceCount ?? self.answerCount ?? self.questionCount ?? self.count ?? self.score ?? 0,
      avatar: self.avatar ?? self.headImg,
      nickname: (self.nickname ?? self.name) || '我'
    };
  }
  if (payload.myRank != null || payload.myPracticeCount != null) {
    const u = appUser || {};
    return {
      rank: payload.myRank || 0,
      count: payload.myPracticeCount ?? payload.myAnswerCount ?? 0,
      avatar: u.avatar || u.headImg,
      nickname: u.nickname || u.name || '我'
    };
  }
  return null;
}

function normalizeRankRow(row, index) {
  const rank = Number(row.rank ?? row.ranking ?? row.sort ?? index + 1) || index + 1;
  const nickname = row.nickname ?? row.name ?? row.userName ?? '用户';
  const avatar = row.avatar ?? row.headImg ?? row.avatarUrl ?? '';
  const count = Number(
    row.practiceCount ?? row.answerCount ?? row.questionCount ?? row.score ?? row.count ?? 0
  );
  const uid = row.userId ?? row.user_id ?? row.id ?? `idx-${index}`;
  const rankClass = rank <= 3 ? `rank-${rank}` : rank <= 10 ? 'rank-top10' : 'rank-n';
  return {
    ...row,
    rank,
    nickname,
    avatar,
    count,
    rankClass,
    rid: String(uid),
    isTop: rank <= 3,
    isTop10: rank <= 10
  };
}

function splitLeaderboard(list) {
  const byRank = {};
  (list || []).forEach((item) => {
    if (item.rank >= 1 && item.rank <= 3 && !byRank[item.rank]) {
      byRank[item.rank] = item;
    }
  });
  const top10List = (list || []).filter((item) => item.rank >= 4 && item.rank <= 10);
  const moreList = (list || []).filter((item) => item.rank > 10);
  return {
    first: byRank[1] || null,
    second: byRank[2] || null,
    third: byRank[3] || null,
    top10List,
    moreList
  };
}

function currentWeekLabel() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const pad = (n) => `${n}`.padStart(2, '0');
  return `${pad(monday.getMonth() + 1)}.${pad(monday.getDate())} - ${pad(sunday.getMonth() + 1)}.${pad(sunday.getDate())}`;
}

Page({
  data: {
    rankList: [],
    top10List: [],
    moreList: [],
    podium: {
      first: null,
      second: null,
      third: null
    },
    hasPodium: false,
    myRankInfo: null,
    weekLabel: currentWeekLabel(),
    hasMore: true,
    page: 1,
    pageSize: 30,
    loading: false,
    loadDone: false,
    loadError: false,
    errorMessage: '',
    defaultAvatar: '/static/avatar1.png'
  },

  onShow() {
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    this.reload();
  },

  onLoad() {
    this._skipShowRefresh = true;
    this.reload();
  },

  onReachBottom() {
    this.fetchRank(false);
  },

  onPullDownRefresh() {
    return this.reload();
  },

  _applyList(merged, myRankInfo) {
    const board = splitLeaderboard(merged);
    this.setData({
      rankList: merged,
      top10List: board.top10List,
      moreList: board.moreList,
      podium: {
        first: board.first,
        second: board.second,
        third: board.third
      },
      hasPodium: !!(board.first || board.second || board.third),
      myRankInfo
    });
  },

  reload() {
    return new Promise((resolve) => {
      this.setData(
        {
          rankList: [],
          top10List: [],
          moreList: [],
          podium: { first: null, second: null, third: null },
          hasPodium: false,
          myRankInfo: null,
          page: 0,
          hasMore: true,
          loadError: false,
          errorMessage: '',
          loadDone: false,
          weekLabel: currentWeekLabel()
        },
        () => resolve(this.fetchRank(true))
      );
    });
  },

  async fetchRank(isRefresh) {
    if (this.data.loading) return;
    if (!isRefresh && !this.data.hasMore) return;

    const nextPage = isRefresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const params = new PracticeRankingParams(nextPage, this.data.pageSize);
      const resBody = await practiceApi.getRanking(params);
      const data = resBody && resBody.data !== undefined && resBody.data !== null ? resBody.data : resBody;
      const rawList = pickRows(data);
      const appUser = app.getUserInfo();
      const mergedForPick = {
        ...(data || {}),
        myRank: data && data.myRank != null ? data.myRank : resBody.myRank
      };
      const myRankInfo = pickMyRankInfo(mergedForPick, appUser);
      const startIdx = (nextPage - 1) * this.data.pageSize;
      const normalized = rawList.map((r, i) => normalizeRankRow(r, startIdx + i));
      const total = data && data.total != null ? data.total : undefined;
      const merged = isRefresh ? normalized : [...this.data.rankList, ...normalized];
      const hasMore =
        typeof total === 'number' ? merged.length < total : normalized.length >= this.data.pageSize;

      this._applyList(merged, myRankInfo);
      this.setData({
        page: nextPage,
        hasMore,
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
    openPage({ url: '/pages/category/index' });
  }
});
