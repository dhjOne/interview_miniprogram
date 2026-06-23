import useToastBehavior from '~/behaviors/useToast';
import { authApi } from '~/api/request/api_login';
import { profileApi, pickProfileData } from '~/api/request/api_profile';
import {
  DARK_MODE_OPTIONS,
  FONT_SCALE_OPTIONS,
  darkModeLabel,
  fontScaleLabel,
  getLocalSettings,
  saveLocalSettings
} from '~/utils/userSettings';

const app = getApp();

Page({
  behaviors: [useToastBehavior],

  data: {
    phoneMasked: '',
    settings: getLocalSettings(),
    darkModeVisible: false,
    fontScaleVisible: false,
    darkModeOptions: DARK_MODE_OPTIONS,
    fontScaleOptions: FONT_SCALE_OPTIONS,
    menuData: [
      [
        {
          title: '编辑个人资料',
          icon: 'user',
          type: 'profile',
          url: '/pages/my/info-edit/index'
        },
        {
          title: '通知设置',
          icon: 'notification',
          type: 'notify',
          switchable: true,
          switchKey: 'notifyEnabled'
        }
      ],
      [
        {
          title: '深色模式',
          icon: 'image',
          type: 'darkMode',
          noteKey: 'darkMode'
        },
        {
          title: '字体大小',
          icon: 'chart',
          type: 'fontScale',
          noteKey: 'fontScale'
        },
        {
          title: '播放设置',
          icon: 'sound',
          type: 'playSound',
          switchable: true,
          switchKey: 'playWithSound'
        }
      ],
      [
        {
          title: '账号安全',
          icon: 'secured',
          type: 'security'
        },
        {
          title: '退出登录',
          icon: 'logout',
          type: 'logout',
          theme: 'danger'
        }
      ]
    ]
  },

  onShow() {
    this.loadPageData();
  },

  async loadPageData() {
    const local = getLocalSettings();
    this.setData({ settings: local });
    try {
      const [profileRes, settingsRes] = await Promise.all([
        profileApi.getPersonalInfo(),
        profileApi.getSettings()
      ]);
      const profile = pickProfileData(profileRes) || {};
      const remoteSettings = pickProfileData(settingsRes) || {};
      const merged = { ...local, ...remoteSettings };
      saveLocalSettings(merged);
      this.setData({
        phoneMasked: this.maskPhone(profile.phone),
        settings: merged
      });
    } catch (e) {
      console.warn('[setting] 加载设置失败，使用本地缓存', e);
    }
  },

  maskPhone(phone) {
    if (!phone || phone.length < 7) return '未绑定手机号';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  },

  getMenuNote(item) {
    if (!item.noteKey) return '';
    const { settings } = this.data;
    if (item.noteKey === 'darkMode') return darkModeLabel(settings.darkMode);
    if (item.noteKey === 'fontScale') return fontScaleLabel(settings.fontScale);
    return '';
  },

  onMenuTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    if (item.url) {
      app.navigateToLogin({ url: item.url });
      return;
    }

    switch (item.type) {
      case 'darkMode':
        this.setData({ darkModeVisible: true });
        break;
      case 'fontScale':
        this.setData({ fontScaleVisible: true });
        break;
      case 'security':
        wx.showModal({
          title: '账号安全',
          content: `当前绑定手机：${this.data.phoneMasked}`,
          showCancel: false
        });
        break;
      case 'logout':
        this.confirmLogout();
        break;
      default:
        break;
    }
  },

  async onSwitchChange(e) {
    const { key } = e.currentTarget.dataset;
    const { value } = e.detail;
    if (!key) return;
    const next = saveLocalSettings({ [key]: value });
    this.setData({ settings: next });
    try {
      await profileApi.updateSettings({ [key]: value });
    } catch (err) {
      console.warn('[setting] 同步设置失败', err);
    }
  },

  async onDarkModePick(e) {
    const { value } = e.detail;
    const darkMode = Array.isArray(value) ? value[0] : value;
    const next = saveLocalSettings({ darkMode });
    this.setData({ settings: next, darkModeVisible: false });
    try {
      await profileApi.updateSettings({ darkMode });
    } catch (err) {
      console.warn('[setting] 同步深色模式失败', err);
    }
  },

  async onFontScalePick(e) {
    const { value } = e.detail;
    const fontScale = Array.isArray(value) ? value[0] : value;
    const next = saveLocalSettings({ fontScale });
    this.setData({ settings: next, fontScaleVisible: false });
    try {
      await profileApi.updateSettings({ fontScale });
    } catch (err) {
      console.warn('[setting] 同步字体设置失败', err);
    }
  },

  hidePicker(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({ [`${mode}Visible`]: false });
  },

  confirmLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await authApi.logout();
        } catch (e) {
          // 忽略退出接口失败，仍清理本地态
        }
        try {
          wx.removeStorageSync('access_token');
          wx.removeStorageSync('refresh_token');
          wx.removeStorageSync('user_info');
        } catch (err) {
          // ignore
        }
        if (app.globalData) {
          app.globalData.userInfo = null;
          app.globalData.token = null;
        }
        this.onShowToast('#t-toast', '已退出登录');
        setTimeout(() => {
          wx.switchTab({ url: '/pages/my/index' });
        }, 400);
      }
    });
  }
});
