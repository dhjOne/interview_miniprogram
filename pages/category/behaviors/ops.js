import { handleApiError } from '~/api/index';
import {
  dismissBannerItemToday,
  dismissBannerToday,
  fetchBannersByPosition,
  filterDismissedBanners,
  interleaveFeedItems,
  isBannerDismissedToday,
  openBannerLink,
  POSITION_CATEGORY_FEED,
  POSITION_CATEGORY_TOP,
} from '~/utils/banners';

/**
 * 题库 Tab：顶部/信息流运营位
 * 依赖页面实例字段：_secondaryRows / _categoryFeedAds
 */
const categoryOpsBehavior = Behavior({
  data: {
    topBanner: null,
    secondaryDisplayList: [],
  },

  methods: {
    async loadOpsSlots() {
      try {
        const [feedAds, topList] = await Promise.all([
          fetchBannersByPosition(POSITION_CATEGORY_FEED),
          fetchBannersByPosition(POSITION_CATEGORY_TOP),
        ]);
        this._categoryFeedAds = filterDismissedBanners(feedAds || []);
        const topBanner =
          !isBannerDismissedToday(POSITION_CATEGORY_TOP) && topList && topList.length
            ? topList[0]
            : null;
        this.setData({ topBanner });
        this._rebuildSecondaryDisplay();
      } catch (error) {
        console.warn('[category] 运营位加载失败', error);
        handleApiError(error, { showToast: false, fallbackMessage: '运营位加载失败' });
        this._categoryFeedAds = [];
        this.setData({ topBanner: null });
        this._rebuildSecondaryDisplay();
      }
    },

    _rebuildSecondaryDisplay() {
      const secondaryDisplayList = interleaveFeedItems(
        this._secondaryRows || [],
        this._categoryFeedAds || [],
        {
          every: 5,
          minBeforeFirst: 4,
          maxAds: 1,
          idPrefix: 'cat-ad',
        },
      );
      this.setData({ secondaryDisplayList });
    },

    onOpsBannerTap(e) {
      const item = (e.detail && e.detail.item) || null;
      openBannerLink(item);
    },

    onTopBannerDismiss() {
      dismissBannerToday(POSITION_CATEGORY_TOP);
      this.setData({ topBanner: null });
    },

    onFeedBannerDismiss(e) {
      const item = (e.detail && e.detail.item) || null;
      if (!item || item.id == null) return;
      dismissBannerItemToday(item.id);
      this._categoryFeedAds = filterDismissedBanners(this._categoryFeedAds || []);
      this._rebuildSecondaryDisplay();
    },
  },
});

export default categoryOpsBehavior;
