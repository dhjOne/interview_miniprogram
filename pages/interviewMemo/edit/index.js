import Message from 'tdesign-miniprogram/message/index';
import { interviewMemoApi, unwrapData, handleApiError } from '~/api/index';
import { backPage } from '~/utils/router';

const STATUS_OPTIONS = [
  { label: '待复习', value: 'todo' },
  { label: '复习中', value: 'reviewing' },
  { label: '已掌握', value: 'mastered' }
];

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (e) {
    return value || '';
  }
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (e) {
      return value.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function today() {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

Page({
  data: {
    id: null,
    loading: false,
    saving: false,
    statusOptions: STATUS_OPTIONS,
    form: {
      questionTitle: '',
      content: '',
      companyName: '',
      positionName: '',
      categoryId: null,
      categoryName: '',
      relatedQuestionId: null,
      status: 'todo',
      interviewedAt: today()
    },
    tagsText: '',
    tags: []
  },

  onLoad(options = {}) {
    const id = options.id ? Number(options.id) : null;
    const prefill = this.buildPrefill(options);
    this.setData({
      id,
      form: {
        ...this.data.form,
        ...prefill
      }
    });

    if (id) {
      wx.setNavigationBarTitle({ title: '编辑速记' });
      this.loadDetail(id);
    } else {
      wx.setNavigationBarTitle({ title: '新增速记' });
    }
  },

  buildPrefill(options) {
    const result = {};
    const title = safeDecode(options.title);
    const categoryName = safeDecode(options.categoryName);
    if (title) result.questionTitle = title;
    if (categoryName) result.categoryName = categoryName;
    if (options.categoryId) result.categoryId = Number(options.categoryId);
    if (options.questionId) result.relatedQuestionId = Number(options.questionId);
    return result;
  },

  async loadDetail(id) {
    this.setData({ loading: true });
    try {
      const res = await interviewMemoApi.getDetail(id);
      const data = unwrapData(res) || {};
      const tags = normalizeTags(data.knowledgeTags);
      this.setData({
        form: {
          questionTitle: data.questionTitle || '',
          content: data.content || '',
          companyName: data.companyName || '',
          positionName: data.positionName || '',
          categoryId: data.categoryId || null,
          categoryName: data.categoryName || '',
          relatedQuestionId: data.relatedQuestionId || null,
          status: data.status || 'todo',
          interviewedAt: data.interviewedAt || today()
        },
        tags,
        tagsText: tags.join('，')
      });
    } catch (error) {
      handleApiError(error, { fallbackMessage: '速记详情加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },

  onDateChange(e) {
    this.setData({
      'form.interviewedAt': e.detail.value
    });
  },

  onStatusTap(e) {
    const status = e.currentTarget.dataset.status;
    if (!status) return;
    this.setData({ 'form.status': status });
  },

  onTagsChange(e) {
    const tagsText = e.detail.value || '';
    const tags = normalizeTags(tagsText);
    this.setData({ tagsText, tags });
  },

  buildPayload() {
    const form = this.data.form;
    return {
      questionTitle: (form.questionTitle || '').trim(),
      content: (form.content || '').trim(),
      companyName: (form.companyName || '').trim(),
      positionName: (form.positionName || '').trim(),
      categoryId: form.categoryId || null,
      categoryName: (form.categoryName || '').trim(),
      knowledgeTags: this.data.tags,
      relatedQuestionId: form.relatedQuestionId || null,
      status: form.status || 'todo',
      interviewedAt: form.interviewedAt || null
    };
  },

  validate(payload) {
    if (!payload.questionTitle) {
      wx.showToast({ title: '请填写问题标题', icon: 'none' });
      return false;
    }
    if (payload.questionTitle.length > 255) {
      wx.showToast({ title: '问题标题太长', icon: 'none' });
      return false;
    }
    return true;
  },

  async onSaveTap() {
    if (this.data.saving) return;
    const payload = this.buildPayload();
    if (!this.validate(payload)) return;

    this.setData({ saving: true });
    try {
      if (this.data.id) {
        await interviewMemoApi.update(this.data.id, payload);
      } else {
        await interviewMemoApi.create(payload);
      }
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 1400,
        content: '已保存'
      });
      setTimeout(() => backPage({ delta: 1 }), 500);
    } catch (error) {
      handleApiError(error, { fallbackMessage: '保存失败，请重试' });
    } finally {
      this.setData({ saving: false });
    }
  }
});
