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
    
    // 工具栏状态
    showToolbarDropdown: false,
    
    // 历史记录（用于撤销/重做）
    contentHistory: [],
    historyIndex: -1,
    canUndo: false,
    canRedo: false,
    
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
    
    // 初始化历史记录
    if (this.data.content) {
      this.saveToHistory(this.data.content);
    }
  },

  // 返回编辑模式
  backToEdit() {
    this.setData({
      activeTab: 'edit'
    });
  },

  // 获取分类名称
  getCategoryName(categoryId) {
    const category = this.data.categories.find(item => item.id === categoryId);
    return category ? category.name : '';
  },

  // 切换工具栏下拉菜单
  toggleToolbarDropdown() {
    this.setData({
      showToolbarDropdown: !this.data.showToolbarDropdown
    });
  },

  // 关闭工具栏下拉菜单
  closeToolbarDropdown() {
    this.setData({
      showToolbarDropdown: false
    });
  },

  // 保存到历史记录
  saveToHistory(content) {
    let { contentHistory, historyIndex } = this.data;
    
    // 如果当前位置不是最后一个，移除后面的记录
    if (historyIndex < contentHistory.length - 1) {
      contentHistory = contentHistory.slice(0, historyIndex + 1);
    }
    
    // 添加新记录
    contentHistory.push(content);
    
    // 最多保存50条记录
    if (contentHistory.length > 50) {
      contentHistory.shift();
    }
    
    this.setData({
      contentHistory,
      historyIndex: contentHistory.length - 1,
      canUndo: contentHistory.length > 1,
      canRedo: false
    });
  },

  // 撤销操作
  undoAction() {
    this.closeToolbarDropdown();
    
    const { contentHistory, historyIndex } = this.data;
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const content = contentHistory[newIndex];
      
      this.setData({
        content,
        parsedContent: this.parseMarkdown(content),
        historyIndex: newIndex,
        canUndo: newIndex > 0,
        canRedo: true
      });
    }
  },

  // 重做操作
  redoAction() {
    this.closeToolbarDropdown();
    
    const { contentHistory, historyIndex } = this.data;
    if (historyIndex < contentHistory.length - 1) {
      const newIndex = historyIndex + 1;
      const content = contentHistory[newIndex];
      
      this.setData({
        content,
        parsedContent: this.parseMarkdown(content),
        historyIndex: newIndex,
        canUndo: true,
        canRedo: newIndex < contentHistory.length - 1
      });
    }
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
    
    // 保存到历史记录
    this.saveToHistory(content);
    
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

  // 插入 Markdown 语法
  insertMarkdown(e) {
    this.closeToolbarDropdown();
    
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
      case 'inline-code':
        insertText = '`行内代码`';
        newCursorPosition = cursorPosition + 1;
        break;
      case 'code':
        insertText = '```\n代码块\n```';
        newCursorPosition = cursorPosition + 4;
        break;
      case 'link':
        insertText = '[链接文字](https://)';
        newCursorPosition = cursorPosition + 5;
        break;
      case 'table':
        insertText = '| 标题1 | 标题2 |\n|-------|-------|\n| 内容1 | 内容2 |';
        newCursorPosition = cursorPosition + 2;
        break;
      case 'divider':
        insertText = '\n---\n';
        newCursorPosition = cursorPosition + 4;
        break;
      case 'checklist':
        insertText = '- [ ] 任务项';
        newCursorPosition = cursorPosition + 2;
        break;
    }
    
    const newContent = 
      content.substring(0, cursorPosition) + 
      insertText + 
      content.substring(cursorPosition);
    
    this.setData({
      content: newContent,
      cursorPosition: newCursorPosition,
      parsedContent: this.parseMarkdown(newContent)
    });
    
    // 保存到历史记录
    this.saveToHistory(newContent);
  },

  // 插入模板
  insertTemplate(e) {
    this.closeToolbarDropdown();
    
    const type = e.currentTarget.dataset.type;
    const { content, cursorPosition } = this.data;
    
    let insertText = '';
    
    switch (type) {
      case 'question':
        insertText = '\n## 问题描述\n\n请详细描述你遇到的问题...\n\n## 复现步骤\n\n1. 第一步\n2. 第二步\n3. 第三步\n\n## 期望结果\n\n描述你期望的正常结果...\n\n## 实际结果\n\n描述实际出现的异常结果...\n\n';
        break;
      case 'code':
        insertText = '\n```\n// 请在此处粘贴你的代码\nfunction example() {\n  console.log("Hello, World!");\n}\n```\n';
        break;
    }
    
    const newContent = 
      content.substring(0, cursorPosition) + 
      insertText + 
      content.substring(cursorPosition);
    
    this.setData({
      content: newContent,
      parsedContent: this.parseMarkdown(newContent)
    });
    
    // 保存到历史记录
    this.saveToHistory(newContent);
  },

  // 选择图片
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
          type: file.fileType
        }));
        
        this.setData({
          images: [...this.data.images, ...newImages]
        });
        
        // 插入图片 Markdown
        const imageMarkdown = newImages.map(img => `\n![图片](${img.url})\n`).join('\n');
        const { content, cursorPosition } = this.data;
        const newContent = 
          content.substring(0, cursorPosition) + 
          imageMarkdown + 
          content.substring(cursorPosition);
        
        this.setData({
          content: newContent,
          parsedContent: this.parseMarkdown(newContent)
        });
        
        // 保存到历史记录
        this.saveToHistory(newContent);
      }
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

  // 简单的 Markdown 解析器
  parseMarkdown(text) {
    if (!text) return [];
    
    const nodes = [];
    const lines = text.split('\n');
    let inCodeBlock = false;
    let codeContent = [];
    
    lines.forEach((line, index) => {
      // 处理代码块
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeContent = [];
        } else {
          inCodeBlock = false;
          nodes.push({
            name: 'pre',
            attrs: { class: 'md-code-block' },
            children: [{ type: 'text', text: codeContent.join('\n') }]
          });
        }
        return;
      }
      
      if (inCodeBlock) {
        codeContent.push(line);
        return;
      }
      
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
          name: 'p',
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
      // 处理引用
      else if (line.startsWith('> ')) {
        nodes.push({
          name: 'blockquote',
          attrs: { class: 'md-quote' },
          children: [{ type: 'text', text: line.substring(2) }]
        });
      }
      // 处理分割线
      else if (line.trim() === '---') {
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
    this.closeToolbarDropdown();
    
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
      title: '',
      content: '',
      selectedCategory: '',
      images: [],
      parsedContent: [],
      cursorPosition: 0,
      showClearConfirmDialog: false,
      contentHistory: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false
    });
    
    // 清除草稿
    wx.removeStorageSync('question_draft');
    
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
      
      console.log('发布问题数据:', questionData);
      
      // 清空草稿
      wx.removeStorageSync('question_draft');
      
      wx.showToast({
        title: '问题发布成功！',
        icon: 'success',
        duration: 2000
      });
      
      this.resetForm();
      
      this.setData({
        isPublishing: false
      });
      
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
      parsedContent: [],
      contentHistory: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false
    });
  },

  onUnload() {
    if (this.data.title || this.data.content) {
      this.saveDraft();
    }
  },

  // 监听页面滚动，如果下拉菜单打开，则关闭它
  onPageScroll() {
    if (this.data.showToolbarDropdown) {
      this.closeToolbarDropdown();
    }
  }
});