/**
 * API 统一出口
 *
 * 推荐：
 *   import { questionApi, unwrapData, handleApiError } from '~/api/index'
 * 或按域：
 *   import { questionApi } from '~/api/index'
 */

export { default as http, BusinessError } from './api_request'
export {
  unwrapData,
  handleApiError,
  getErrorMessage,
  isUnauthorizedError
} from './helpers'

export { authApi } from './request/api_login'
export { questionApi } from './request/api_question'
export { categoryApi } from './request/api_category'
export { searchApi } from './request/api_search'
export { socialApi } from './request/api_social'
export { profileApi, pickProfileData, normalizePersonalInfo } from './request/api_profile'
export { practiceApi } from './request/api_practice'
export { pointsApi } from './request/api_points'
export { bannerApi } from './request/api_banner'
export { siteApi } from './request/api_site'
export { businessApi } from './request/api_business'
export { creatorInsightsApi } from './request/api_creator_insights'
export { aiApi } from './request/api_ai'
