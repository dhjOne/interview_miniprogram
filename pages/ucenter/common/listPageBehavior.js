import { fetchSocialList } from '~/utils/userSocial';
import { socialApi } from '~/api/request/api_social';

/**
 * 关注 / 粉丝 / 访问 列表页通用逻辑
 * @param {'following'|'followers'|'visits'} listType
 */
export function createSocialListPage(listType) {
  return {
    data: {
      list: [],
      page: 1,
      pageSize: 20,
      hasMore: true,
      loading: false,
      loadDone: false,
      loadError: false,
      fromDemo: false,
      defaultAvatar: '/static/avatar1.png'
    },

    onLoad() {
      this.reload();
    },

    onReachBottom() {
      this.loadList(false);
    },

    onPullDownRefresh() {
      return this.reload();
    },

    reload() {
      return new Promise((resolve) => {
        this.setData(
          {
            list: [],
            page: 0,
            hasMore: true,
            loadError: false,
            loadDone: false,
            fromDemo: false
          },
          () => resolve(this.loadList(true))
        );
      });
    },

    async loadList(isRefresh) {
      if (this.data.loading) return;
      if (!isRefresh && !this.data.hasMore) return;

      const nextPage = isRefresh ? 1 : this.data.page + 1;
      this.setData({ loading: true });

      try {
        const { list, total, fromDemo } = await fetchSocialList(
          listType,
          nextPage,
          this.data.pageSize
        );
        const merged = isRefresh ? list : [...this.data.list, ...list];
        const hasMore = merged.length < total;

        this.setData({
          list: merged,
          page: nextPage,
          hasMore,
          fromDemo,
          loadDone: true,
          loadError: false
        });
      } catch (e) {
        console.error(`[${listType}] 列表加载失败`, e);
        this.setData({
          loadError: !!isRefresh,
          loadDone: true
        });
      } finally {
        this.setData({ loading: false });
      }
    },

    async onFollowTap(e) {
      const { id, index } = e.currentTarget.dataset;
      const idx = Number(index);
      if (Number.isNaN(idx) || !this.data.list[idx]) return;

      const item = this.data.list[idx];
      const nextFollowing = !item.isFollowing;
      const key = `list[${idx}].isFollowing`;
      this.setData({ [key]: nextFollowing });

      try {
        const res = await socialApi.toggleFollow({ userId: id, follow: nextFollowing });
        if (res.code !== '0000') throw new Error(res.message || '操作失败');
        wx.showToast({
          title: nextFollowing ? '已关注' : '已取消关注',
          icon: 'none'
        });
      } catch (err) {
        this.setData({ [key]: item.isFollowing });
        wx.showToast({
          title: err?.message || '操作失败',
          icon: 'none'
        });
      }
    }
  };
}
