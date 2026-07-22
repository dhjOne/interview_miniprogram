import { getMarkdownSnippet, getMarkdownTemplate } from '~/utils/markdownInsertSnippets';

/**
 * Markdown 编辑器：工具栏插入 / 模板 / 选图
 * 依赖宿主：updatePreviewContent / saveToHistory / scrollToBottom
 */
const markdownToolbarBehavior = Behavior({
  data: {
    showToolbarDropdown: false,
    images: [],
    lastInsertType: '',
  },

  methods: {
    toggleToolbarDropdown() {
      this.setData({
        showToolbarDropdown: !this.data.showToolbarDropdown,
      });
    },

    closeToolbarDropdown() {
      this.setData({
        showToolbarDropdown: false,
      });
    },

    _appendMarkdownInsert(insertText, insertTypeName) {
      if (!insertText) return;
      const { markdownContent } = this.data;
      const newContent = markdownContent + insertText;

      this.setData(
        {
          markdownContent: newContent,
          lastInsertType: insertTypeName,
          cursorPosition: markdownContent.length,
        },
        () => {
          this.updatePreviewContent();
          this.saveToHistory(newContent);

          setTimeout(() => {
            this.scrollToBottom();
          }, 100);

          wx.showToast({
            title: `已插入${insertTypeName}到文档末尾`,
            icon: 'success',
            duration: 1500,
          });
        },
      );
    },

    insertMarkdown(e) {
      this.closeToolbarDropdown();
      const type = e.currentTarget.dataset.type;
      const snippet = getMarkdownSnippet(type);
      if (!snippet) return;
      this._appendMarkdownInsert(snippet.text, snippet.name);
    },

    insertTemplate(e) {
      this.closeToolbarDropdown();
      const type = e.currentTarget.dataset.type;
      const template = getMarkdownTemplate(type);
      if (!template) return;
      this._appendMarkdownInsert(template.text, template.name);
    },

    chooseImage() {
      this.closeToolbarDropdown();

      wx.chooseMedia({
        count: 9 - this.data.images.length,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const newImages = res.tempFiles.map((file, index) => ({
            id: Date.now() + index,
            url: file.tempFilePath,
            type: file.fileType,
          }));

          this.setData({
            images: [...this.data.images, ...newImages],
          });

          const imageMarkdown = newImages
            .map((img, index) => `\n\n![图片${index + 1}](${img.url})`)
            .join('\n');
          const { markdownContent } = this.data;
          const newContent = markdownContent + imageMarkdown;

          this.setData(
            {
              markdownContent: newContent,
              lastInsertType: '图片',
              cursorPosition: newContent.length,
            },
            () => {
              this.updatePreviewContent();
              this.saveToHistory(newContent);

              setTimeout(() => {
                this.scrollToBottom();
              }, 100);

              wx.showToast({
                title: `已插入${newImages.length}张图片到文档末尾`,
                icon: 'success',
                duration: 1500,
              });
            },
          );
        },
      });
    },
  },
});

export default markdownToolbarBehavior;
