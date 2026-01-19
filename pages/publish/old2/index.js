// pages/publish/publish.js
Page({
  data: {
    // 表单数据
    title: '',
    content: '',
    selectedCategory: '',
    images: [],
    
    // 编辑器状态
    activeTab: 'edit',
    cursorPosition: 0,
    maxLength: 5000,
    isPublishing: false,
    showConfirmDialog: false,
    showClearConfirmDialog: false,
    
    // 下拉菜单状态
    showFormatDropdown: false,
    showInsertDropdown: false,
    
    // 分类选项
    categories: [
      { id: 'tech', name: '技术问题' },
      { id: 'product', name: '产品建议' },
      { id: 'bug', name: 'Bug反馈' },
      { id: 'question', name: '使用咨询' },
      { id: 'other', name: '其他问题' }
    ],
    
    // 解析后的内容
    parsedContent: []
  },

  onLoad() {
    this.initEditor();
  },

  // 初始化编辑器
  initEditor() {
    // 尝试从草稿中恢复
    this.loadDraft();
  },

  // 切换格式下拉菜单
  toggleFormatDropdown() {
    this.setData({
      showFormatDropdown: !this.data.showFormatDropdown,
      // 关闭其他下拉菜单
      showInsertDropdown: false
    });
  },

  // 切换插入下拉菜单
  toggleInsertDropdown() {
    this.setData({
      showInsertDropdown: !this.data.showInsertDropdown,
      // 关闭其他下拉菜单
      showFormatDropdown: false
    });
  },

  // 关闭所有下拉菜单
  closeAllDropdowns() {
    this.setData({
      showFormatDropdown: false,
      showInsertDropdown: false
    });
  },

  // 插入 Markdown 语法
  insertMarkdown(e) {
    const type = e.currentTarget.dataset.type;
    const { content, cursorPosition } = this.data;
    
    let insertText = '';
    let newCursorPosition = cursorPosition;
    
    switch (type) {
      case 'h1':
        insertText = '# 标题';
        newCursorPosition = cursorPosition + 2;
        break;
      case 'h2':
        insertText = '## 标题';
        newCursorPosition = cursorPosition + 3;
        break;
      case 'h3':
        insertText = '### 标题';
        newCursorPosition = cursorPosition + 4;
        break;
      case 'bold':
        insertText = '**粗体文字**';
        newCursorPosition = cursorPosition + 2;
        break;
      case 'italic':
        insertText = '*斜体文字*';
        newCursorPosition = cursorPosition + 1;
        break;
      case 'list':
        insertText = '- 列表项';
        newCursorPosition = cursorPosition + 2;
        break;
      case 'ordered-list':
        insertText = '1. 列表项';
        newCursorPosition = cursorPosition + 3;
        break;
      case 'quote':
        insertText = '> 引用内容';
        newCursorPosition = cursorPosition + 2;
        break;
      case 'code':
        insertText = '```\n代码块\n```';
        newCursorPosition = cursorPosition + 4;
        break;
      case 'inline-code':
        insertText = '`代码`';
        newCursorPosition = cursorPosition + 1;
        break;
      case 'link':
        insertText = '[链接文字](https://)';
        newCursorPosition = cursorPosition + 5;
        break;
      case 'image':
        this.chooseImage();
        // 关闭下拉菜单
        this.setData({ showInsertDropdown: false });
        return;
      case 'table':
        insertText = '| 标题1 | 标题2 |\n|-------|-------|\n| 内容1 | 内容2 |';
        newCursorPosition = cursorPosition + 2;
        break;
      case 'divider':
        insertText = '\n---\n';
        newCursorPosition = cursorPosition + 4;
        break;
    }
    
    // 插入文本
    const newContent = 
      content.substring(0, cursorPosition) + 
      insertText + 
      content.substring(cursorPosition);
    
    this.setData({
      content: newContent,
      cursorPosition: newCursorPosition,
      parsedContent: this.parseMarkdown(newContent),
      // 关闭下拉菜单
      showFormatDropdown: false,
      showInsertDropdown: false
    });
  },

  // 标题变更
  onTitleChange(e) {
    this.setData({
      title: e.detail.value
    });
  },

  // 内容变更
  onContentChange(e) {
    const content = e.detail.value;
    this.setData({
      content,
      parsedContent: this.parseMarkdown(content)
    });
    
    // 自动保存草稿
    this.autoSaveDraft();
  },

  // 选择分类
  selectCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    this.setData({
      selectedCategory: categoryId
    });
  },

  // 切换标签页
  onTabChange(e) {
    this.setData({
      activeTab: e.detail.value
    });
  },

  // 选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 9 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map((file, index) => ({
          id: Date.now() + index,
          url: file.tempFilePath,
          type: file.fileType
        }));
        
        this.setData({
          images: [...this.data.images, ...newImages]
        });
        
        // 插入图片 Markdown
        const imageMarkdown = newImages.map(img => `![图片](${img.url})`).join('\n');
        this.insertImageMarkdown(imageMarkdown);
      }
    });
  },

  // 插入图片 Markdown
  insertImageMarkdown(markdown) {
    const { content, cursorPosition } = this.data;
    const newContent = 
      content.substring(0, cursorPosition) + 
      '\n' + markdown + '\n' + 
      content.substring(cursorPosition);
    
    this.setData({
      content: newContent,
      parsedContent: this.parseMarkdown(newContent)
    });
  },

  // 编辑器焦点事件
  onEditorFocus(e) {
    this.setData({
      cursorPosition: e.detail.cursor
    });
  },

  onEditorBlur(e) {
    this.setData({
      cursorPosition: e.detail.cursor
    });
  },

  onEditorConfirm() {
    // 可以在这里处理回车键的逻辑
  },

  // 简单的 Markdown 解析器
  parseMarkdown(text) {
    if (!text) return [];
    
    const nodes = [];
    const lines = text.split('\n');
    
    lines.forEach((line, index) => {
      // 处理标题
      if (line.startsWith('# ')) {
        nodes.push({
          name: 'h1',
          attrs: { class: 'md-h1' },
          children: [{ type: 'text', text: line.substring(2) }]
        });
      } else if (line.startsWith('## ')) {
        nodes.push({
          name: 'h2',
          attrs: { class: 'md-h2' },
          children: [{ type: 'text', text: line.substring(3) }]
        });
      } else if (line.startsWith('### ')) {
        nodes.push({
          name: 'h3',
          attrs: { class: 'md-h3' },
          children: [{ type: 'text', text: line.substring(4) }]
        });
      }
      // 处理粗体
      else if (line.includes('**')) {
        const parts = line.split('**');
        const children = [];
        parts.forEach((part, i) => {
          if (i % 2 === 1) {
            children.push({
              name: 'strong',
              children: [{ type: 'text', text: part }]
            });
          } else if (part) {
            children.push({ type: 'text', text: part });
          }
        });
        nodes.push({
          name: 'div',
          children
        });
      }
      // 处理斜体
      else if (line.includes('*') && !line.startsWith('* ') && !line.endsWith('*')) {
        const parts = line.split('*');
        const children = [];
        parts.forEach((part, i) => {
          if (i % 2 === 1) {
            children.push({
              name: 'em',
              children: [{ type: 'text', text: part }]
            });
          } else if (part) {
            children.push({ type: 'text', text: part });
          }
        });
        nodes.push({
          name: 'div',
          children
        });
      }
      // 处理列表
      else if (line.startsWith('- ')) {
        nodes.push({
          name: 'li',
          attrs: { class: 'md-list-item' },
          children: [{ type: 'text', text: line.substring(2) }]
        });
      }
      // 处理有序列表
      else if (/^\d+\. /.test(line)) {
        nodes.push({
          name: 'li',
          attrs: { class: 'md-ordered-item' },
          children: [{ type: 'text', text: line.replace(/^\d+\. /, '') }]
        });
      }
      // 处理引用
      else if (line.startsWith('> ')) {
        nodes.push({
          name: 'blockquote',
          attrs: { class: 'md-quote' },
          children: [{ type: 'text', text: line.substring(2) }]
        });
      }
      // 处理代码块
      else if (line.startsWith('```')) {
        nodes.push({
          name: 'pre',
          attrs: { class: 'md-code-block' },
          children: [{ type: 'text', text: line.substring(3) }]
        });
      }
      // 处理行内代码
      else if (line.includes('`')) {
        const parts = line.split('`');
        const children = [];
        parts.forEach((part, i) => {
          if (i % 2 === 1) {
            children.push({
              name: 'code',
              attrs: { class: 'md-inline-code' },
              children: [{ type: 'text', text: part }]
            });
          } else if (part) {
            children.push({ type: 'text', text: part });
          }
        });
        nodes.push({
          name: 'div',
          children
        });
      }
      // 处理分割线
      else if (line.trim() === '---' || line.trim() === '***') {
        nodes.push({
          name: 'hr',
          attrs: { class: 'md-divider' }
        });
      }
      // 普通文本
      else if (line.trim()) {
        nodes.push({
          name: 'p',
          children: [{ type: 'text', text: line }]
        });
      }
      // 空行
      else {
        nodes.push({
          name: 'br'
        });
      }
    });
    
    return nodes;
  },

  // 显示清除确认弹窗
  showClearConfirmDialog() {
    if (!this.data.content.trim() && !this.data.title.trim()) {
      wx.showToast({
        title: '暂无内容可清除',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    this.setData({
      showClearConfirmDialog: true
    });
  },

  // 隐藏清除确认弹窗
  hideClearConfirmDialog() {
    this.setData({
      showClearConfirmDialog: false
    });
  },

  // 清除内容
  clearContent() {
    this.setData({
      content: '',
      parsedContent: [],
      cursorPosition: 0,
      showClearConfirmDialog: false
    });
    
    // 清除草稿
    wx.removeStorageSync('question_draft');
    
    // 显示成功消息
    wx.showToast({
      title: '内容已清除',
      icon: 'success',
      duration: 2000
    });
  },

  // 保存草稿
  saveDraft() {
    const draft = {
      title: this.data.title,
      content: this.data.content,
      selectedCategory: this.data.selectedCategory,
      images: this.data.images,
      timestamp: Date.now()
    };
    
    wx.setStorageSync('question_draft', draft);
    
    wx.showToast({
      title: '草稿已保存',
      icon: 'success',
      duration: 2000
    });
  },

  // 自动保存草稿
  autoSaveDraft() {
    // 防抖处理，避免频繁保存
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setTimeout(() => {
      this.saveDraft();
    }, 2000);
  },

  // 加载草稿
  loadDraft() {
    const draft = wx.getStorageSync('question_draft');
    if (draft) {
      this.setData({
        title: draft.title || '',
        content: draft.content || '',
        selectedCategory: draft.selectedCategory || '',
        images: draft.images || [],
        parsedContent: this.parseMarkdown(draft.content || '')
      });
    }
  },

  // 验证表单
  validateForm() {
    if (!this.data.title.trim()) {
      wx.showToast({
        title: '请填写问题标题',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    if (this.data.title.length < 5) {
      wx.showToast({
        title: '标题至少需要5个字',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    if (!this.data.selectedCategory) {
      wx.showToast({
        title: '请选择问题分类',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    if (!this.data.content.trim()) {
      wx.showToast({
        title: '请填写问题描述',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    if (this.data.content.length < 20) {
      wx.showToast({
        title: '问题描述至少需要20个字',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    return true;
  },

  // 发布问题
  publishQuestion() {
    if (!this.validateForm()) {
      return;
    }
    
    this.setData({
      showConfirmDialog: true
    });
  },

  // 确认发布
  confirmPublish() {
    this.setData({
      showConfirmDialog: false,
      isPublishing: true
    });
    
    // 模拟发布请求
    setTimeout(() => {
      const questionData = {
        title: this.data.title,
        content: this.data.content,
        category: this.data.selectedCategory,
        images: this.data.images,
        createTime: new Date().toISOString()
      };
      
      // 这里应该调用实际的 API 接口
      console.log('发布问题数据:', questionData);
      
      // 清空草稿
      wx.removeStorageSync('question_draft');
      
      // 显示成功消息
      wx.showToast({
        title: '问题发布成功！',
        icon: 'success',
        duration: 2000
      });
      
      // 重置表单
      this.resetForm();
      
      this.setData({
        isPublishing: false
      });
      
      // 跳转到问题列表或详情页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }, 1500);
  },

  // 取消发布
  cancelPublish() {
    this.setData({
      showConfirmDialog: false
    });
  },

  // 重置表单
  resetForm() {
    this.setData({
      title: '',
      content: '',
      selectedCategory: '',
      images: [],
      parsedContent: []
    });
  },

  onUnload() {
    // 页面卸载时保存草稿
    if (this.data.title || this.data.content) {
      this.saveDraft();
    }
  },

  // 监听页面点击，点击其他地方时关闭下拉菜单
  onPageTap(e) {
    // 可以在这里添加逻辑，点击页面其他地方时关闭下拉菜单
  }
});