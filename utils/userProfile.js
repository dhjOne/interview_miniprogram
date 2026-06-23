import { profileApi, pickProfileData, normalizePersonalInfo } from '~/api/request/api_profile';

const app = getApp();

export async function fetchPersonalInfo() {
  const res = await profileApi.getPersonalInfo();
  return normalizePersonalInfo(pickProfileData(res));
}

export async function savePersonalInfo(payload) {
  await profileApi.updatePersonalInfo(payload);
  const info = normalizePersonalInfo(payload);
  syncCachedUserInfo(info);
  return info;
}

export function syncCachedUserInfo(info) {
  if (!info) return;
  const cached = {
    ...(app.getUserInfo?.() || wx.getStorageSync('user_info') || {}),
    userId: info.userId,
    nickname: info.nickname,
    avatar: info.avatar,
    bio: info.bio,
    phone: info.phone
  };
  if (app.setUserInfo) {
    app.setUserInfo(cached);
  } else {
    wx.setStorageSync('user_info', cached);
  }
}

export function toEditForm(info) {
  const normalized = normalizePersonalInfo(info);
  return {
    nickname: normalized.nickname || '',
    avatar: normalized.avatar || '',
    gender: normalized.gender ?? 2,
    birth: normalized.birth || '',
    address: normalized.address || [],
    addressText: normalized.addressText || '',
    bio: normalized.bio || '',
    photos: normalized.photos || []
  };
}

export function toSavePayload(form) {
  return {
    nickname: form.nickname,
    avatar: form.avatar,
    gender: form.gender,
    birth: form.birth,
    address: form.address,
    addressText: form.addressText,
    bio: form.bio,
    photos: form.photos
  };
}
