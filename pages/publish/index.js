import { questionApi, handleApiError } from '~/api/index';
import { QuestionPublishParams } from '~/api/param/param_publish';
import { consumePendingPublish } from '~/utils/aiChatStorage';
import categoryCascaderBehavior from '~/behaviors/categoryCascaderBehavior';
import markdownEditorBehavior from '~/behaviors/markdownEditorBehavior';
// 获取应用实例
const app = getApp();

Page({
  behaviors: [categoryCascaderBehavior, markdownEditorBehavior],
  data: {},

  onLoad(options) {
    this._fromMknow = options && options.from === 'mknow';
    this.loadLevel1Categories().then(() => {
      this.initEditor();
    });
  },

  async onPullDownRefresh() {
    this.categorySubCache = {};
    await this.loadLevel1Categories();
    this.updatePreviewContent();
  },

  /** initEditor 钩子：优先导入 AI 对话 */
  beforeInitEditor() {
    if (this._fromMknow && this.applyMknowImport()) {
      return true;
    }
    return false;
  },

  applyMknowImport() {
    const pending = consumePendingPublish();
    if (!pending || !pending.markdownContent) return false;

    this.setData(
      {
        docTitle: pending.docTitle || '',
        markdownContent: pending.markdownContent,
        wordCount: (pending.markdownContent || '').length,
      },
      () => {
        this.updatePreviewContent();
        setTimeout(() => this.scrollToBottom(), 300);
      },
    );

    wx.showToast({
      title: '已导入 AI 对话',
      icon: 'success',
      duration: 2000,
    });
    return true;
  },

  /** 自动保存钩子：发布页仅写本地 storage */
  onAutoSaveDraft() {
    this.saveDraft({ silent: true });
  },

  // 保存草稿（本地 storage）
  saveDraft(options = {}) {
    const silent = options && options.silent;
    const draft = {
      docTitle: this.data.docTitle,
      markdownContent: this.data.markdownContent,
      selectedCategory: this.data.selectedCategory,
      selectedParentCategory: this.data.selectedParentCategory,
      categoryName: this.data.categoryName,
      categorySuggestName: this.data.categorySuggestName,
      images: this.data.images,
      previewFullContent: this.data.previewFullContent,
      timestamp: Date.now(),
    };

    wx.setStorageSync('markdown_draft', draft);

    if (!silent) {
      wx.showToast({
        title: '草稿已保存',
        icon: 'success',
        duration: 2000,
      });
    }
  },

  // 发布文档
  publishDocument() {
    if (!this.validateForm()) {
      return;
    }
    this.setData({
      showConfirmDialog: true,
    });
  },

  // 确认发布（接口在业务失败时会 reject；明文/密文响应均在 api_request 内统一解密后再校验 code）
  async confirmPublish() {
    this.setData({
      showConfirmDialog: false,
      isPublishing: true,
    });

    try {
      await this.submitCategorySuggestIfNeeded();

      const previewFullContent = this.buildFullPreviewContent();
      this.setData({ previewFullContent });

      const publishParams = new QuestionPublishParams(
        this.data.docTitle,
        this.data.selectedCategory,
        this.data.markdownContent,
        previewFullContent,
      );
      await questionApi.publishQuestion(publishParams);

      wx.removeStorageSync('markdown_draft');
      wx.showToast({
        title: '已提交审核，过审后将获得积分',
        icon: 'success',
        duration: 2500,
      });

      this.setData({
        docTitle: '',
        markdownContent: '',
        selectedCategory: '',
        selectedParentCategory: '',
        categoryLevel2: [],
        categoryCascaderValue: '',
        categorySuggestName: '',
        isFallbackCategorySelected: false,
        showCascaderMissPanel: false,
        cascaderMissSuggest: '',
        images: [],
        renderedContent: null,
        contentHistory: [],
        historyIndex: -1,
        canUndo: false,
        canRedo: false,
        wordCount: 0,
        previewFullContent: '',
        categoryName: '',
        lastInsertType: '',
        editorScrollTop: 0,
        editorAutoScroll: false,
      });
      this.updatePreviewContent();
    } catch (error) {
      console.error('发布失败', error);
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
    } finally {
      this.setData({ isPublishing: false });
    }
  },

  // 取消发布
  cancelPublish() {
    this.setData({
      showConfirmDialog: false,
    });
  },

  onUnload() {
    if (this.data.docTitle || this.data.markdownContent) {
      this.saveDraft();
    }
  },
});
