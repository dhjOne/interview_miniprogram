import { questionApi, handleApiError } from '~/api/index';
import { QuestionPublishParams } from '~/api/param/param_publish';
import { QuestionParams } from '~/api/param/param_question';
import categoryCascaderBehavior from '~/behaviors/categoryCascaderBehavior';
import markdownEditorBehavior from '~/behaviors/markdownEditorBehavior';
import { backPage } from '~/utils/router';
// 获取应用实例
const app = getApp();

Page({
  behaviors: [categoryCascaderBehavior, markdownEditorBehavior],
  data: {
    /** 编辑已有文档时的 id；新建为空 */
    editDocId: null
  },

  _unwrapPublishDetail(res) {
    if (!res || typeof res !== 'object') return {};
    const d = res.data !== undefined ? res.data : res;
    if (d && typeof d === 'object' && d.data !== undefined && d.title === undefined && d.content === undefined) {
      return d.data || {};
    }
    return d;
  },

  /** 根据详情里的 categoryId 回显一级、二级 */
  async applyDetailCategory(categoryId, fallbackName) {
    const patch = await this.resolveCategorySelection(categoryId, fallbackName);
    if (patch) {
      this.setData(
        {
          ...patch,
          ...this.syncCascaderFromSelection(patch.selectedCategory, patch.categoryName)
        },
        () => this.updatePreviewContent()
      );
    }
  },

  async loadDocForEdit(id) {
    wx.showLoading({ title: '加载文档…', mask: true });
    try {
      const questionDetail = new QuestionParams(null, null, id)

      const res = await questionApi.getQuestionDetail(questionDetail);
      const row = this._unwrapPublishDetail(res);
      const title = row.title || '';
      const content = row.content || row.markdownContent || '';
      const categoryId = row.categoryId ?? row.category_id ?? '';
      const categoryName = row.categoryName || row.category_name || '';
      const previewFullContent =
        row.previewFullContent || row.preview_full_content || '';

      this.setData(
        {
          docTitle: title,
          markdownContent: content,
          selectedCategory: '',
          selectedParentCategory: '',
          categoryLevel2: [],
          previewFullContent,
          categoryName: '',
          wordCount: (content || '').length,
          contentHistory: [content],
          historyIndex: 0,
          canUndo: false,
          canRedo: false,
          lastInsertType: ''
        },
        () => {
          this.updatePreviewContent();
        }
      );
      await this.applyDetailCategory(categoryId, categoryName);
      wx.setNavigationBarTitle({ title: '编辑文档' });
    } catch (e) {
      console.error(e);
      handleApiError(e, { fallbackMessage: '加载失败' });
      this.setData({ editDocId: null });
    } finally {
      wx.hideLoading();
    }
  },

  async onLoad(options) {
    await this.loadLevel1Categories();
    const idFromQuery =
      options && options.id != null && String(options.id).trim() !== ''
        ? String(options.id).trim()
        : '';
    if (idFromQuery) {
      try {
        wx.removeStorageSync('release_edit_doc_id');
      } catch (e) {
        // ignore
      }
      this.setData({ editDocId: idFromQuery });
      await this.loadDocForEdit(idFromQuery);
      return;
    }
    const sid = wx.getStorageSync('release_edit_doc_id');
    if (sid) {
      wx.removeStorageSync('release_edit_doc_id');
      this.setData({ editDocId: String(sid) });
      await this.loadDocForEdit(String(sid));
      return;
    }
    await this.initEditor();
  },

  async onPullDownRefresh() {
    this.categorySubCache = {};
    await this.loadLevel1Categories();
    if (this.data.editDocId) {
      await this.loadDocForEdit(this.data.editDocId);
      return;
    }
    this.updatePreviewContent();
  },

  /** initEditor 钩子：新建时导航栏仍显示「发布文档」 */
  beforeInitEditor() {
    wx.setNavigationBarTitle({ title: '发布文档' });
    return false;
  },

  // 保存草稿 - 调用统一接口，operationType为draft
  async saveDraft() {
    // 验证基本内容
    if (!this.data.docTitle.trim()) {
      wx.showToast({
        title: '请填写标题',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    if (!this.data.markdownContent.trim()) {
      wx.showToast({
        title: '请输入内容',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    if (!this.data.selectedParentCategory) {
      wx.showToast({
        title: '请选择分类',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    wx.showLoading({
      title: '保存中…',
      mask: true
    });

    try {
      const previewFullContent = this.buildFullPreviewContent();
      this.setData({ previewFullContent });
      const publishParams = new QuestionPublishParams(
        this.data.docTitle,
        this.data.selectedCategory,
        this.data.markdownContent,
        previewFullContent,
        this.data.editDocId,
        'draft' // 操作类型：保存草稿
      );
      await questionApi.publishQuestion(publishParams);
      wx.showToast({
        title: '草稿已保存',
        icon: 'success',
        duration: 2000
      });
    } catch (error) {
      handleApiError(error, { fallbackMessage: '保存失败，请重试' });
    } finally {
      wx.hideLoading();
    }
  },

  /** 仅写入本地草稿，不调发布接口（用于自动保存与页面卸载，避免与「发布」混淆） */
  persistDraftLocal() {
    try {
      wx.setStorageSync('markdown_draft', {
        docTitle: this.data.docTitle || '',
        markdownContent: this.data.markdownContent || '',
        images: this.data.images || [],
        previewFullContent: this.data.previewFullContent || '',
        selectedParentCategory: this.data.selectedParentCategory || '',
        selectedCategory: this.data.selectedCategory || '',
        categoryName: this.data.categoryName || '',
        categorySuggestName: this.data.categorySuggestName || ''
      });
    } catch (e) {
      console.error('persistDraftLocal', e);
    }
  },

  // 发布文档
  publishDocument() {
    if (!this.validateForm()) {
      return;
    }
    this.setData({
      showConfirmDialog: true
    });
  },

  // 确认发布 / 保存编辑
  async confirmPublish() {
    this.setData({
      showConfirmDialog: false,
      isPublishing: true
    });

    // 根据editDocId判断操作类型：update(修改)|publish(发布)
    const operationType = this.data.editDocId ? 'update' : 'publish';
    const isEdit = !!this.data.editDocId;

    wx.showLoading({
      title: isEdit ? '保存中…' : '发布中…',
      mask: true
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
        this.data.editDocId,
        operationType // 操作类型：update(修改)|publish(发布)
      );
      await questionApi.publishQuestion(publishParams);
      wx.removeStorageSync('markdown_draft');
      wx.showToast({
        title: isEdit ? '保存成功' : '发布成功',
        icon: 'success',
        duration: 1800
      });

      if (isEdit) {
        this.setData({ isPublishing: false, editDocId: null });
        backPage({ delta: 1 });
        return;
      }

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
        isPublishing: false,
        editorScrollTop: 0,
        editorAutoScroll: false
      });
    } catch (error) {
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
    } finally {
      wx.hideLoading();
      this.setData({ isPublishing: false });
    }
  },

  // 取消发布
  cancelPublish() {
    this.setData({
      showConfirmDialog: false
    });
  },

  onUnload() {
    if (this.data.docTitle || this.data.markdownContent) {
      this.persistDraftLocal();
    }
  },

  /**
   * Android 实体返回键：先关闭遮罩/弹窗，再允许系统返回上一页。
   * 避免在「确认发布」等弹窗打开时，系统返回被误当成确认（依赖机型/基础库差异）。
   */
  onBackPress() {
    if (this.data.showToolbarDropdown) {
      this.closeToolbarDropdown();
      return true;
    }
    if (this.data.showConfirmDialog) {
      this.setData({ showConfirmDialog: false });
      return true;
    }
    if (this.data.showClearConfirmDialog) {
      this.setData({ showClearConfirmDialog: false });
      return true;
    }
    return false;
  }
});
