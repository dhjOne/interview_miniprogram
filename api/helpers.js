/**
 * 统一响应解包与错误处理（页面 / utils 用）
 *
 * 约定：
 * - http 层已校验业务码，成功后直接 unwrapData(res)
 * - catch 里优先 handleApiError(err)，避免各处重复 Toast
 */

/** 取出业务 data；无 data 字段时返回原对象 */
export function unwrapData(res) {
  if (res == null) return null
  if (typeof res !== 'object' || Array.isArray(res)) return res
  return res.data !== undefined ? res.data : res
}

export function getErrorMessage(error, fallback = '请求失败，请稍后重试') {
  if (error == null) return fallback
  if (typeof error === 'string') return error
  const msg = error.message || error.msg || error.errMsg
  return msg || fallback
}

/** 登录过期类错误（底层已 Toast + 跳转，页面勿再弹） */
export function isUnauthorizedError(error) {
  if (!error) return false
  const code = error.code != null ? String(error.code).trim() : ''
  return code === '401' || code === 'C105'
}

/**
 * @param {*} error
 * @param {Object} [options]
 * @param {boolean} [options.showToast=true]
 * @param {boolean} [options.silentUnauthorized=true] 401/C105 不重复 Toast
 * @param {string} [options.fallbackMessage]
 * @param {number} [options.duration=2000]
 * @returns {{ handled: boolean, unauthorized: boolean, message: string }}
 */
export function handleApiError(error, options = {}) {
  const {
    showToast = true,
    silentUnauthorized = true,
    fallbackMessage = '请求失败，请稍后重试',
    duration = 2000
  } = options

  const message = getErrorMessage(error, fallbackMessage)
  const unauthorized = isUnauthorizedError(error)

  if (unauthorized && silentUnauthorized) {
    return { handled: true, unauthorized: true, message }
  }

  if (showToast) {
    try {
      wx.showToast({ title: String(message).slice(0, 40), icon: 'none', duration })
    } catch (e) {
      // ignore
    }
  }

  return { handled: true, unauthorized, message }
}
