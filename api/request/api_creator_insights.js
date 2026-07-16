import http from '../api_request';

/**
 * 创作者数据洞察
 * GET /repository/creator/insights/*
 */
export const creatorInsightsApi = {
  /** 总览：阅读/赞/藏/评/作品状态/粉丝/访问/排名 */
  getOverview: () =>
    http.get('/repository/creator/insights/overview', null, {
      showLoading: false
    }),

  /**
   * 热门作品
   * @param {{ sort?: 'view'|'like'|'collect'|'comment', limit?: number }} params
   */
  getTop: (params) =>
    http.get('/repository/creator/insights/top', params, {
      showLoading: false
    }),

  /**
   * 互动趋势
   * @param {{ metric?: 'like'|'collect', range?: '7d'|'30d' }} params
   */
  getTrend: (params) =>
    http.get('/repository/creator/insights/trend', params, {
      showLoading: false
    })
};
