import http from '../api_request';

export const profileApi = {
  getPersonalInfo: () =>
    http.get('/wechat/mini/user/profile', null, {
      showLoading: false
    }),

  updatePersonalInfo: (data) =>
    http.put('/wechat/mini/user/profile', data, {
      showLoading: true,
      loadingText: '保存中...'
    }),

  getProfessionOptions: () =>
    http.get('/wechat/mini/user/professions', null, {
      showLoading: false
    }),

  getSettings: () =>
    http.get('/wechat/mini/user/settings', null, {
      showLoading: false
    }),

  updateSettings: (data) =>
    http.put('/wechat/mini/user/settings', data, {
      showLoading: false
    })
};

export function pickProfileData(res) {
  if (!res || typeof res !== 'object') return null;
  return res.data !== undefined ? res.data : res;
}

export function normalizePersonalInfo(raw) {
  if (!raw || typeof raw !== 'object') return {};
  return {
    userId: raw.userId ?? raw.id,
    nickname: raw.nickname ?? raw.name ?? '',
    avatar: raw.avatar ?? raw.image ?? '',
    bio: raw.bio ?? raw.introduction ?? raw.brief ?? '',
    phone: raw.phone ?? '',
    gender: raw.gender ?? 2,
    birth: raw.birth ?? raw.birthday ?? '',
    address: raw.address || [],
    addressText: raw.addressText ?? '',
    photos: raw.photos || [],
    professionCodes: raw.professionCodes || []
  };
}
