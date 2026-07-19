import useToastBehavior from '~/behaviors/useToast';
import http from '~/api/api_request';
import config from '~/config/index';
import {
  fetchPersonalInfo,
  savePersonalInfo,
  toEditForm,
  toSavePayload
} from '~/utils/userProfile';
import { fetchProfessionOptions, formatProfessionText } from '~/utils/profession';
import { areaList } from './areaData.js';

Page({
  behaviors: [useToastBehavior],

  data: {
    personInfo: {
      nickname: '',
      avatar: '',
      gender: 2,
      birth: '',
      address: [],
      addressText: '',
      bio: '',
      photos: [],
      professionCodes: [],
    },
    professionText: '请选择',
    professionOptions: [],
    genderOptions: [
      { label: '男', value: 0 },
      { label: '女', value: 1 },
      { label: '保密', value: 2 },
    ],
    birthVisible: false,
    birthStart: '1970-01-01',
    birthEnd: '2030-12-31',
    birthFilter: (type, options) => (type === 'year' ? options.sort((a, b) => b.value - a.value) : options),
    addressVisible: false,
    professionPickerVisible: false,
    provinces: [],
    cities: [],
    gridConfig: {
      column: 3,
      width: 160,
      height: 160,
    },
    saving: false,
  },

  onLoad() {
    this._skipShowRefresh = true;
    this.initAreaData();
    this.loadProfessionOptions();
    this.loadPersonalInfo();
  },

  onShow() {
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    // 从职业选择页返回时同步最新职业信息
    this.loadPersonalInfo();
  },

  onPullDownRefresh() {
    return Promise.all([
      this.loadProfessionOptions(),
      this.loadPersonalInfo()
    ]);
  },

  async loadProfessionOptions() {
    try {
      const professionOptions = await fetchProfessionOptions();
      this.setData({ professionOptions }, () => this.syncProfessionText());
    } catch (e) {
      console.error('[info-edit] 加载职业选项失败', e);
    }
  },

  async loadPersonalInfo() {
    try {
      const info = await fetchPersonalInfo();
      const personInfo = toEditForm(info);
      this.setData({ personInfo }, () => {
        this.syncAddressText(personInfo);
        this.syncProfessionText();
      });
    } catch (e) {
      console.error('[info-edit] 加载个人信息失败', e);
      this.onShowToast('#t-toast', e.message || '加载失败');
    }
  },

  syncProfessionText() {
    const { personInfo, professionOptions } = this.data;
    this.setData({
      professionText: formatProfessionText(personInfo.professionCodes, professionOptions)
    });
  },

  showProfessionPicker() {
    this.setData({ professionPickerVisible: true });
  },

  hideProfessionPicker() {
    this.setData({ professionPickerVisible: false });
  },

  onProfessionConfirm(e) {
    const professionCodes = e.detail.professionCodes || [];
    this.setData({
      'personInfo.professionCodes': professionCodes,
      professionPickerVisible: false
    }, () => this.syncProfessionText());
  },

  syncAddressText(personInfo) {
    const { address } = personInfo || this.data.personInfo;
    if (!address || !address.length) {
      if (personInfo && personInfo.addressText) {
        this.setData({ 'personInfo.addressText': personInfo.addressText });
      }
      return;
    }
    const province = areaList.provinces[address[0]] || '';
    const city = areaList.cities[address[1]] || '';
    const addressText = [province, city].filter(Boolean).join(' ');
    this.setData({
      'personInfo.addressText': addressText || personInfo.addressText || '',
    });
  },

  getAreaOptions(data, filter) {
    const res = Object.keys(data).map((key) => ({ value: key, label: data[key] }));
    return typeof filter === 'function' ? res.filter(filter) : res;
  },

  getCities(provinceValue) {
    return this.getAreaOptions(
      areaList.cities,
      (city) => `${city.value}`.slice(0, 2) === `${provinceValue}`.slice(0, 2),
    );
  },

  initAreaData() {
    const provinces = this.getAreaOptions(areaList.provinces);
    const cities = this.getCities(provinces[0].value);
    this.setData({ provinces, cities });
  },

  onAreaPick(e) {
    const { column, index } = e.detail;
    const { provinces } = this.data;
    if (column === 0) {
      const cities = this.getCities(provinces[index].value);
      this.setData({ cities });
    }
  },

  showPicker(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({ [`${mode}Visible`]: true });
    if (mode === 'address') {
      const provinceCode = this.data.personInfo.address[0];
      const cities = provinceCode ? this.getCities(provinceCode) : this.data.cities;
      this.setData({ cities });
    }
  },

  hidePicker(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({ [`${mode}Visible`]: false });
  },

  onPickerChange(e) {
    const { value, label } = e.detail;
    const { mode } = e.currentTarget.dataset;
    if (mode === 'birth') {
      this.setData({ 'personInfo.birth': value });
      return;
    }
    if (mode === 'address') {
      this.setData({
        'personInfo.address': value,
        'personInfo.addressText': Array.isArray(label) ? label.join(' ') : '',
      });
    }
  },

  personInfoFieldChange(field, e) {
    const { value } = e.detail;
    this.setData({ [`personInfo.${field}`]: value });
  },

  onNicknameChange(e) {
    this.personInfoFieldChange('nickname', e);
  },

  onGenderChange(e) {
    this.personInfoFieldChange('gender', e);
  },

  onBioChange(e) {
    this.personInfoFieldChange('bio', e);
  },

  async onChooseAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl;
    if (!avatarUrl) return;
    try {
      const uploaded = await this.uploadImage(avatarUrl);
      this.setData({ 'personInfo.avatar': uploaded });
    } catch (err) {
      console.error('[info-edit] 头像上传失败', err);
      this.onShowToast('#t-toast', '头像上传失败');
    }
  },

  async onPhotosSuccess(e) {
    const { files } = e.detail;
    const current = this.data.personInfo.photos || [];
    const pending = (files || []).filter((item) => item.url && !item.url.startsWith('http'));
    if (!pending.length) {
      this.setData({ 'personInfo.photos': files });
      return;
    }
    wx.showLoading({ title: '上传中...', mask: true });
    try {
      const uploaded = await Promise.all(
        pending.map(async (item) => {
          const url = await this.uploadImage(item.url);
          return { ...item, url };
        }),
      );
      const merged = (files || []).map((item) => {
        const hit = uploaded.find((u) => u.name === item.name);
        return hit || item;
      });
      this.setData({ 'personInfo.photos': merged });
    } catch (err) {
      console.error('[info-edit] 相片上传失败', err);
      this.onShowToast('#t-toast', '图片上传失败');
    } finally {
      wx.hideLoading();
    }
  },

  onPhotosRemove(e) {
    const { index } = e.detail;
    const photos = [...(this.data.personInfo.photos || [])];
    photos.splice(index, 1);
    this.setData({ 'personInfo.photos': photos });
  },

  onPhotosDrop(e) {
    const { files } = e.detail;
    this.setData({ 'personInfo.photos': files });
  },

  uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      http.upload(filePath, null, {}, { url: '/files/upload', checkBusinessCode: false })
        .then((res) => {
          let url = res.downloadUrl || (res.fileInfo && res.fileInfo.url) || res.url;
          if (!url) {
            reject(new Error('上传响应缺少文件地址'));
            return;
          }
          if (!url.startsWith('http')) {
            const base = (config.baseUrl || '').replace(/\/$/, '');
            url = url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
          }
          resolve(url);
        })
        .catch(reject);
    });
  },

  async onSaveInfo() {
    if (this.data.saving) return;
    const { personInfo } = this.data;
    if (!personInfo.nickname || !personInfo.nickname.trim()) {
      this.onShowToast('#t-toast', '请填写昵称');
      return;
    }
    this.setData({ saving: true });
    try {
      await savePersonalInfo(toSavePayload(personInfo));
      this.onShowToast('#t-toast', '保存成功，已提交审核');
      setTimeout(() => wx.navigateBack(), 500);
    } catch (e) {
      console.error('[info-edit] 保存失败', e);
      this.onShowToast('#t-toast', e.message || '保存失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});
