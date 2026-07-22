import markdownToolbarBehavior from '~/behaviors/markdownToolbarBehavior';

const { renderMarkdown } = require('../utils/towxmlLoader');

/**
 * 发布页 / 文档编辑页共用的 Markdown 编辑器逻辑
 *（输入、预览、历史撤销、滚动、清除、表单校验、本地草稿加载）。
 * 工具栏插入见 markdownToolbarBehavior。
 *
 * 草稿持久化策略可能不同：
 * - 发布页：autoSave → saveDraft（本地 storage）
 * - 编辑页：autoSave → persistDraftLocal；显式保存走 API
 * 页面可实现 onAutoSaveDraft / persistDraftLocal / beforeInitEditor 钩子。
 */
const markdownEditorBehavior = Behavior({
  behaviors: [markdownToolbarBehavior],

  data: {
    docTitle: '',
    markdownContent: '',

    activeTab: 'edit',
    cursorPosition: 0,
    maxLength: 5000,
    isPublishing: false,
    showConfirmDialog: false,
    showClearConfirmDialog: false,

    contentHistory: [],
    historyIndex: -1,
    canUndo: false,
    canRedo: false,

    renderedContent: null,
    wordCount: 0,
    previewFullContent: '',

    editorScrollTop: 0,
    editorAutoScroll: false,
    lastScrollPosition: 0,
    isScrolling: false,

    editorLineCount: 1,
    insertOperations: [],
  },

  methods: {
    /**
     * 初始化编辑器（加载本地草稿 + 空内容时填入示例）。
     * 页面可实现 beforeInitEditor：返回 true 表示已处理完毕（如 mknow 导入）。
     */
    async initEditor() {
      if (typeof this.beforeInitEditor === 'function') {
        const handled = await this.beforeInitEditor();
        if (handled) return;
      }

      await this.loadDraft();

      if (!this.data.markdownContent) {
        this.setData(
          {
            markdownContent:
              '# 欢迎使用技术文档编辑器\n\n这是一个支持Markdown实时预览的编辑器，您可以开始撰写您的技术文档。',
          },
          () => {
            this.updatePreviewContent();
          },
        );
      }
    },

    onTitleChange(e) {
      const title = e.detail.value.trim();
      this.setData(
        {
          docTitle: title,
        },
        () => {
          this.updatePreviewContent();
        },
      );
    },

    onContentChange(e) {
      const content = e.detail.value;
      const wordCount = content.length;

      this.setData(
        {
          markdownContent: content,
          wordCount: wordCount,
        },
        () => {
          this.updatePreviewContent();
          this.checkAutoScroll();
        },
      );

      this.saveToHistory(content);
      this.autoSaveDraft();
    },

    saveToHistory(content) {
      let { contentHistory, historyIndex } = this.data;

      if (historyIndex < contentHistory.length - 1) {
        contentHistory = contentHistory.slice(0, historyIndex + 1);
      }

      contentHistory.push(content);

      if (contentHistory.length > 50) {
        contentHistory.shift();
      }

      this.setData({
        contentHistory,
        historyIndex: contentHistory.length - 1,
        canUndo: contentHistory.length > 1,
        canRedo: false,
      });
    },

    undoAction() {
      this.closeToolbarDropdown();

      const { contentHistory, historyIndex } = this.data;
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        const content = contentHistory[newIndex];

        this.setData(
          {
            markdownContent: content,
            historyIndex: newIndex,
            canUndo: newIndex > 0,
            canRedo: true,
          },
          () => {
            this.updatePreviewContent();
            setTimeout(() => {
              this.scrollToCursor();
            }, 100);
          },
        );
      }
    },

    redoAction() {
      this.closeToolbarDropdown();

      const { contentHistory, historyIndex } = this.data;
      if (historyIndex < contentHistory.length - 1) {
        const newIndex = historyIndex + 1;
        const content = contentHistory[newIndex];

        this.setData(
          {
            markdownContent: content,
            historyIndex: newIndex,
            canUndo: true,
            canRedo: newIndex < contentHistory.length - 1,
          },
          () => {
            this.updatePreviewContent();
            setTimeout(() => {
              this.scrollToCursor();
            }, 100);
          },
        );
      }
    },

    onTabChange(e) {
      this.setData({
        activeTab: e.detail.value,
      });

      if (e.detail.value === 'edit') {
        setTimeout(() => {
          this.scrollToBottom();
        }, 200);
      }
    },

    buildFullPreviewContent() {
      const { docTitle, categoryName, markdownContent } = this.data;

      let fullContent = '';

      if (docTitle) {
        fullContent += `<div style="text-align: center; margin-bottom: 40rpx;">\n`;
        fullContent += `  <h1 style="font-size: 48rpx; font-weight: 700; color: #1d2129; margin: 0;">${docTitle}</h1>\n`;

        if (categoryName) {
          fullContent += `  <div style="text-align: right; margin: 0;">\n`;
          fullContent += `    <span style="background: #165dff; color: white; padding: 4rpx 16rpx; border-radius: 16rpx; font-size: 24rpx; display: inline-block;">${categoryName}</span>\n`;
          fullContent += `  </div>\n`;
        }
        fullContent += `</div>\n\n`;
      } else {
        fullContent += `<div style="text-align: center; margin-bottom: 40rpx;">\n`;
        fullContent += `  <h1 style="font-size: 48rpx; font-weight: 700; color: #c9cdd4; margin: 0;">未命名文档</h1>\n`;
        fullContent += `</div>\n\n`;
      }

      if (markdownContent) {
        fullContent += markdownContent;
      } else {
        fullContent += `## 文档内容\n\n`;
        fullContent += `请在此处输入您的文档内容...\n\n`;
        fullContent += `### 编辑器特色功能\n\n`;
        fullContent += `- **实时预览**：编辑内容即时渲染\n`;
        fullContent += `- **代码高亮**：支持多种编程语言\n`;
        fullContent += `- **数学公式**：使用 LaTeX 语法\n`;
        fullContent += `- **表格支持**：创建美观的表格\n`;
        fullContent += `- **模板插入**：快速插入常用模板\n`;
      }

      return fullContent;
    },

    updatePreviewContent() {
      const fullContent = this.buildFullPreviewContent();

      this.setData({
        previewFullContent: fullContent,
      });

      if (!fullContent) return;

      renderMarkdown(fullContent, { theme: 'light', base: '', events: {} })
        .then((renderedContent) => {
          if (renderedContent) {
            this.setData({ renderedContent });
          }
        })
        .catch((error) => {
          console.error('Markdown 渲染错误:', error);
        });
    },

    onEditorFocus(e) {
      this.setData({
        cursorPosition: e.detail.cursor,
      });
    },

    onEditorBlur(e) {
      this.setData({
        cursorPosition: e.detail.cursor,
      });
    },

    onEditorLineChange(e) {
      const lineCount = e.detail.lineCount;
      this.setData({
        editorLineCount: lineCount,
      });
    },

    onEditorConfirm() {
      setTimeout(() => {
        this.scrollToCursor();
      }, 50);
    },

    onEditorScroll(e) {
      const scrollTop = e.detail.scrollTop;
      this.setData({
        lastScrollPosition: scrollTop,
        isScrolling: true,
      });

      if (this.autoScrollTimer) {
        clearTimeout(this.autoScrollTimer);
      }

      this.autoScrollTimer = setTimeout(() => {
        this.setData({
          isScrolling: false,
        });
      }, 2000);
    },

    scrollToCursor() {
      if (this.data.isScrolling) return;

      const cursorPos = this.data.cursorPosition;
      const content = this.data.markdownContent;
      const linesBeforeCursor = content.substring(0, cursorPos).split('\n').length;
      const estimatedScrollTop = Math.max(0, linesBeforeCursor * 30 - 200);

      this.setData({
        editorScrollTop: estimatedScrollTop,
        editorAutoScroll: true,
      });

      setTimeout(() => {
        this.setData({
          editorAutoScroll: false,
        });
      }, 3000);
    },

    scrollToBottom() {
      if (this.data.isScrolling) return;

      this.setData({
        editorScrollTop: 999999,
        editorAutoScroll: true,
      });

      setTimeout(() => {
        this.setData({
          editorAutoScroll: false,
        });
      }, 3000);
    },

    checkAutoScroll() {
      const cursorPos = this.data.cursorPosition;
      const contentLength = this.data.markdownContent.length;
      const isNearEnd = cursorPos > contentLength * 0.8;

      if (isNearEnd && !this.data.isScrolling) {
        setTimeout(() => {
          this.scrollToCursor();
        }, 100);
      }
    },

    showClearConfirmDialog() {
      this.closeToolbarDropdown();

      if (!this.data.markdownContent.trim() && !this.data.docTitle.trim()) {
        wx.showToast({
          title: '暂无内容可清除',
          icon: 'none',
          duration: 2000,
        });
        return;
      }

      this.setData({
        showClearConfirmDialog: true,
      });
    },

    hideClearConfirmDialog() {
      this.setData({
        showClearConfirmDialog: false,
      });
    },

    clearContent() {
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
        cursorPosition: 0,
        showClearConfirmDialog: false,
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

      wx.removeStorageSync('markdown_draft');

      wx.showToast({
        title: '内容已清除',
        icon: 'success',
        duration: 2000,
      });
    },

    /**
     * 自动保存：优先调用页面 onAutoSaveDraft；
     * 否则若存在 persistDraftLocal 则写本地草稿。
     */
    autoSaveDraft() {
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
      }

      this.autoSaveTimer = setTimeout(() => {
        if (typeof this.onAutoSaveDraft === 'function') {
          this.onAutoSaveDraft();
          return;
        }
        if (typeof this.persistDraftLocal === 'function') {
          if (this.data.docTitle || this.data.markdownContent) {
            this.persistDraftLocal();
          }
        }
      }, 2000);
    },

    async loadDraft() {
      const draft = wx.getStorageSync('markdown_draft');
      if (!draft) return;

      const base = {
        docTitle: draft.docTitle || '',
        markdownContent: draft.markdownContent || '',
        images: draft.images || [],
        previewFullContent: draft.previewFullContent || '',
        categorySuggestName: draft.categorySuggestName || '',
        isFallbackCategorySelected: !!(
          draft.categorySuggestName && String(draft.categorySuggestName).trim()
        ),
      };

      let categoryPatch = {
        selectedCategory: '',
        selectedParentCategory: '',
        categoryLevel2: [],
        categoryName: '',
      };

      if (draft.selectedParentCategory) {
        const parentId = draft.selectedParentCategory;
        let categoryLevel2 = [];
        try {
          categoryLevel2 = await this.fetchSubCategories(parentId);
        } catch (e) {
          console.error('loadDraft fetchSubCategories', e);
        }
        let categoryName = draft.categoryName || '';
        if (!categoryName && draft.selectedCategory) {
          const p = (this.data.categoryLevel1 || []).find((x) => String(x.id) === String(parentId));
          const c = categoryLevel2.find((x) => String(x.id) === String(draft.selectedCategory));
          if (p && c) categoryName = `${p.name} / ${c.name}`;
          else if (c) categoryName = c.name;
          else if (p && String(draft.selectedCategory) === String(parentId)) {
            categoryName = p.name;
          }
        }
        categoryPatch = {
          selectedParentCategory: parentId,
          selectedCategory: draft.selectedCategory || '',
          categoryLevel2,
          categoryName,
        };
      } else if (draft.selectedCategory) {
        const resolved = await this.resolveCategorySelection(
          draft.selectedCategory,
          draft.categoryName || '',
        );
        if (resolved) {
          categoryPatch = resolved;
        }
      }

      this.setData(
        {
          ...base,
          ...categoryPatch,
          ...this.syncCascaderFromSelection(
            categoryPatch.selectedCategory,
            categoryPatch.categoryName,
          ),
          wordCount: (draft.markdownContent || '').length,
        },
        () => {
          this.updatePreviewContent();
          setTimeout(() => {
            this.scrollToBottom();
          }, 300);
        },
      );
    },

    validateForm() {
      if (!this.data.docTitle.trim()) {
        wx.showToast({
          title: '请填写文档标题',
          icon: 'none',
          duration: 2000,
        });
        return false;
      }

      if (this.data.docTitle.length < 2) {
        wx.showToast({
          title: '标题至少需要2个字',
          icon: 'none',
          duration: 2000,
        });
        return false;
      }

      if (!this.data.selectedParentCategory) {
        wx.showToast({
          title: '请选择文档分类',
          icon: 'none',
          duration: 2000,
        });
        return false;
      }
      if (!this.data.selectedCategory) {
        wx.showToast({
          title: '请选择文档分类',
          icon: 'none',
          duration: 2000,
        });
        return false;
      }

      if (this._isSelectedFallbackCategory()) {
        const suggest = String(this.data.categorySuggestName || '').trim();
        if (!suggest) {
          this.openCategoryCascaderMiss();
          wx.showToast({
            title: '请填写建议分类名称',
            icon: 'none',
            duration: 2000,
          });
          return false;
        }
      }

      if (!this.data.markdownContent.trim()) {
        wx.showToast({
          title: '请填写文档内容',
          icon: 'none',
          duration: 2000,
        });
        return false;
      }

      if (this.data.markdownContent.length < 10) {
        wx.showToast({
          title: '内容至少需要10个字',
          icon: 'none',
          duration: 2000,
        });
        return false;
      }

      return true;
    },

    onPageScroll() {
      if (this.data.showToolbarDropdown) {
        this.closeToolbarDropdown();
      }
    },
  },
});

export default markdownEditorBehavior;
