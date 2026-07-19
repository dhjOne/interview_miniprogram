import { socialApi } from '~/api/request/api_social';
import {
  DEFAULT_AVATAR,
  fetchUserProfile,
  fetchUserQuestions,
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
      isFollowing: false,
      isBlocked: false,
      isBlockedByTarget: false,
      auditStatus: 1
    },
    articleList: [],
    allArticleList: [],
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
    defaultAvatar: DEFAULT_AVATAR,
    categories: [
      { id: 'all', name: '全部', count: 0 },
      { id: 'tech', name: '技术', count: 0 },
      { id: 'life', name: '生活', count: 0 },
      { id: 'news', name: '资讯', count: 0 },
      { id: 'other', name: '其他', count: 0 }
    ],
    activeCategory: 'all'
  },

  onLoad(options) {
    const userId = options.userId || options.id;
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
      fromDemo: false
    };

    if (nickname || avatar) {
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
    this._skipShowRefresh = true;
    this.loadProfile();
    this.loadArticles(true);
  },

  onShow() {
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    if (!this.data.userId) return;
    this.reloadPage();
  },

  onReachBottom() {
    this.loadArticles(false);
  },

  onPullDownRefresh() {
    return this.reloadPage();
  },

  reloadPage() {
    return Promise.all([
      this.loadProfile(),
      this.loadArticles(true)
    ]);
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
      const labeled = (list || []).map((item) => ({
        ...item,
        categoryLabel: this._categoryLabel(item.category)
      }));
      const allMerged = isRefresh ? labeled : [...this.data.allArticleList, ...labeled];
      const hasMore = allMerged.length < total;

      const profile = { ...this.data.profile };
      if (!profile.publishCount) {
        profile.publishCount = total;
      }

      const updatedCategories = this.updateCategoryCounts(allMerged, this.data.categories);
      const filtered = this.getFilteredArticles(allMerged, this.data.activeCategory);

      this.setData({
        allArticleList: allMerged,
        articleList: filtered,
        totalCount: total,
        page: nextPage,
        hasMore,
        profile,
        fromDemo: this.data.fromDemo || fromDemo,
        listDone: true,
        listError: false,
        categories: updatedCategories
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
    if (this.data.profile.isBlocked || this.data.profile.isBlockedByTarget) {
      wx.showToast({ title: '双方存在拉黑关系，无法关注', icon: 'none' });
      return;
    }

    const nextFollowing = !this.data.profile.isFollowing;
    const prevFollowing = this.data.profile.isFollowing;
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
      console.warn('[profile] 关注失败', e);
      this.setData({ 'profile.isFollowing': prevFollowing });
      wx.showToast({
        title: e?.message || '操作失败',
        icon: 'none'
      });
    }
  },

  onMoreTap() {
    if (this.data.isSelf) return;
    const isBlocked = !!this.data.profile.isBlocked;
    wx.showActionSheet({
      itemList: ['举报用户', isBlocked ? '解除拉黑' : '拉黑用户'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          this.reportUser();
        } else {
          isBlocked ? this.unblockUser() : this.blockUser();
        }
      }
    });
  },

  async reportUser() {
    try {
      const res = await socialApi.submitReport({
        targetType: 'USER',
        targetId: this.data.userId,
        targetUserId: this.data.userId,
        targetTitle: this.data.profile.nickname,
        reasonType: 'OTHER',
        reason: '用户主页举报'
      });
      if (res.code !== '0000') throw new Error(res.message || '提交失败');
      wx.showToast({ title: '举报已提交', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e?.message || '提交失败', icon: 'none' });
    }
  },

  async blockUser() {
    wx.showModal({
      title: '拉黑用户',
      content: '拉黑后将自动取消双方关注，并限制后续互动，确定拉黑吗？',
      success: async ({ confirm }) => {
        if (!confirm) return;
        try {
          const res = await socialApi.blockUser({
            userId: this.data.userId,
            reason: '用户主动拉黑'
          });
          if (res.code !== '0000') throw new Error(res.message || '操作失败');
          this.setData({
            'profile.isBlocked': true,
            'profile.isFollowing': false
          });
          wx.showToast({ title: '已拉黑', icon: 'none' });
        } catch (e) {
          wx.showToast({ title: e?.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  async unblockUser() {
    try {
      const res = await socialApi.unblockUser(this.data.userId);
      if (res.code !== '0000') throw new Error(res.message || '操作失败');
      this.setData({ 'profile.isBlocked': false });
      wx.showToast({ title: '已解除拉黑', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e?.message || '操作失败', icon: 'none' });
    }
  },

  onArticleTap(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    const titleQ = title ? `&title=${encodeURIComponent(title)}` : '';
    app.navigateToLogin({
      url: `/pages/question/detail/index?id=${id}${titleQ}`
    });
  },

  onCategoryChange(e) {
    const category = e.currentTarget.dataset.category;
    if (category === this.data.activeCategory) return;

    this.setData({
      activeCategory: category,
      page: 1
    });

    const filtered = this.getFilteredArticles(this.data.allArticleList, category);
    this.setData({
      articleList: filtered,
      hasMore: filtered.length < this.data.totalCount
    });
  },

  getFilteredArticles(list, category) {
    if (category === 'all') {
      return list;
    }
    return list.filter(item => item.category === category);
  },

  _categoryLabel(category) {
    const map = { tech: '技术', life: '生活', news: '资讯', other: '其他' };
    return map[category] || '';
  },

  updateCategoryCounts(list, categories) {
    const counts = {
      all: list.length,
      tech: 0,
      life: 0,
      news: 0,
      other: 0
    };

    list.forEach(item => {
      const category = item.category || 'other';
      if (category in counts) {
        counts[category]++;
      } else {
        counts.other++;
      }
    });

    return categories.map(cat => ({
      ...cat,
      count: counts[cat.id] || 0
    }));
  }
});
