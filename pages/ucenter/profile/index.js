import { socialApi } from '~/api/request/api_social';
import {
  DEFAULT_AVATAR,
  DEMO_AUTHOR_ID,
  fetchUserProfile,
  fetchUserQuestions,
  getDemoProfile,
  getDemoQuestions,
  isDemoProfileEnabled,
  normalizeProfileRow
} from '~/utils/userProfile';

const app = getApp();

Page({
  data: {
    userId: '',
    profile: {
      userId: '',
      nickname: '用户',
      avatar: DEFAULT_AVATAR,
      bio: '',
      followingCount: 0,
      followerCount: 0,
      publishCount: 0,
      likeCount: 0,
      isFollowing: false
    },
    articleList: [],
    totalCount: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    pageLoading: true,
    listLoading: false,
    listDone: false,
    listError: false,
    fromDemo: false,
    isSelf: false,
    defaultAvatar: DEFAULT_AVATAR
  },

  onLoad(options) {
    const useDemo = options.demo === '1' || isDemoProfileEnabled();
    const userId = options.userId || options.id || (useDemo ? DEMO_AUTHOR_ID : '');
    if (!userId) {
      wx.showToast({ title: '用户不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    const nickname = options.nickname ? decodeURIComponent(options.nickname) : '';
    const avatar = options.avatar ? decodeURIComponent(options.avatar) : '';
    const selfInfo = app.getUserInfo?.() || wx.getStorageSync('user_info') || {};
    const selfId = String(selfInfo.userId ?? selfInfo.id ?? selfInfo.user_id ?? '');

    const patch = {
      userId,
      isSelf: selfId && String(userId) === selfId,
      fromDemo: useDemo
    };

    if (useDemo) {
      const { profile } = getDemoProfile(userId);
      const { list, total } = getDemoQuestions(1, this.data.pageSize);
      patch.profile = nickname || avatar
        ? normalizeProfileRow(
            { ...profile, nickname: nickname || profile.nickname, avatar: avatar || profile.avatar },
            userId
          )
        : profile;
      patch.articleList = list;
      patch.totalCount = total;
      patch.hasMore = list.length < total;
      patch.page = 1;
      patch.pageLoading = false;
      patch.listDone = true;
      patch.listLoading = false;
    } else if (nickname || avatar) {
      patch.profile = normalizeProfileRow(
        {
          userId,
          nickname: nickname || '用户',
          avatar: avatar || DEFAULT_AVATAR
        },
        userId
      );
    }

    this.setData(patch);

    if (!useDemo) {
      this.loadProfile();
      this.loadArticles(true);
    }
  },

  onReachBottom() {
    this.loadArticles(false);
  },

  async loadProfile() {
    this.setData({ pageLoading: true });
    try {
      const { profile, fromDemo } = await fetchUserProfile(this.data.userId);
      const merged = { ...this.data.profile, ...profile };
      if (!merged.publishCount && this.data.totalCount) {
        merged.publishCount = this.data.totalCount;
      }
      this.setData({
        profile: merged,
        fromDemo: this.data.fromDemo || fromDemo,
        pageLoading: false
      });
      if (merged.nickname) {
        wx.setNavigationBarTitle({ title: merged.nickname });
      }
    } catch (e) {
      console.error('[profile] 加载资料失败', e);
      this.setData({ pageLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  reloadArticles() {
    this.loadArticles(true);
  },

  async loadArticles(isRefresh) {
    if (this.data.listLoading) return;
    if (!isRefresh && !this.data.hasMore) return;

    const nextPage = isRefresh ? 1 : this.data.page + 1;
    this.setData({ listLoading: true, listError: false });

    try {
      const { list, total, fromDemo } = await fetchUserQuestions(
        this.data.userId,
        nextPage,
        this.data.pageSize
      );
      const merged = isRefresh ? list : [...this.data.articleList, ...list];
      const hasMore = merged.length < total;

      const profile = { ...this.data.profile };
      if (!profile.publishCount) {
        profile.publishCount = total;
      }

      this.setData({
        articleList: merged,
        totalCount: total,
        page: nextPage,
        hasMore,
        profile,
        fromDemo: this.data.fromDemo || fromDemo,
        listDone: true,
        listError: false
      });
    } catch (e) {
      console.error('[profile] 文章列表失败', e);
      this.setData({
        listError: !!isRefresh,
        listDone: true
      });
    } finally {
      this.setData({ listLoading: false });
    }
  },

  async onToggleFollow() {
    if (this.data.isSelf) return;

    const nextFollowing = !this.data.profile.isFollowing;
    this.setData({ 'profile.isFollowing': nextFollowing });

    try {
      const response = await socialApi.toggleFollow({
        userId: this.data.userId,
        follow: nextFollowing
      });
      if (response.code !== '0000') {
        throw new Error(response.message || '操作失败');
      }
      wx.showToast({
        title: nextFollowing ? '已关注' : '已取消关注',
        icon: 'none'
      });
    } catch (e) {
      console.warn('[profile] 关注接口未就绪', e);
      wx.showToast({
        title: nextFollowing ? '已关注' : '已取消关注',
        icon: 'none'
      });
    }
  },

  onArticleTap(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    const titleQ = title ? `&title=${encodeURIComponent(title)}` : '';
    app.navigateToLogin({
      url: `/pages/question/detail/index?id=${id}${titleQ}`
    });
  }
});
