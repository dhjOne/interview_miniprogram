// pages/question-publish/index.js
Page({
  data: {
    // 分类数据
    category: '',
    categoryOptions: [
      { label: '前端开发', value: 'frontend' },
      { label: '后端开发', value: 'backend' },
      { label: '移动开发', value: 'mobile' },
      { label: '数据库', value: 'database' },
      { label: 'DevOps', value: 'devops' },
      { label: '人工智能', value: 'ai' },
      { label: '区块链', value: 'blockchain' },
      { label: '其他', value: 'other' }
    ],

    // 问题内容
    questionTitle: '',
    questionContent: '',

    // 答案内容
    answerContent: '',
    previewContent: '',

    // 代码编辑
    showCodeDialog: false,
    codeContent: '',
    codeLanguage: 'javascript',
    languageOptions: [
      { label: 'JavaScript', value: 'javascript' },
      { label: 'TypeScript', value: 'typescript' },
      { label: 'HTML', value: 'html' },
      { label: 'CSS', value: 'css' },
      { label: 'Python', value: 'python' },
      { label: 'Java', value: 'java' },
      { label: 'C++', value: 'cpp' },
      { label: 'SQL', value: 'sql' },
      { label: 'Shell', value: 'shell' }
    ],

    // 样式工具
    showToolbar: false,

    // 附加选项
    isPublic: true,
    allowComments: true,
    selectedTags: [],
    tagOptions: [
      { label: 'Vue.js', value: 'vue' },
      { label: 'React', value: 'react' },
      { label: 'Node.js', value: 'node' },
      { label: '小程序', value: 'mini-program' },
      { label: '性能优化', value: 'performance' },
      { label: '算法', value: 'algorithm' },
      { label: '架构设计', value: 'architecture' }
    ],

    // 草稿标识
    draftId: null
  },

  onLoad(options) {
    // 从缓存加载草稿
    this.loadDraft();
    
    // 如果有编辑的问答，加载数据
    if (options.id) {
      this.loadQuestion(options.id);
    }
  },

  // 分类选择
  onCategoryChange(e) {
    this.setData({ category: e.detail.value });
  },

  // 问题标题输入
  onQuestionTitleChange(e) {
    this.setData({ questionTitle: e.detail.value });
  },

  // 问题内容输入
  onQuestionContentChange(e) {
    this.setData({ questionContent: e.detail.value });
  },

  // 答案内容输入
  onAnswerChange(e) {
    const content = e.detail.value;
    this.setData({ 
      answerContent: content,
      previewContent: this.parseMarkdown(content)
    });
  },

  // 显示代码编辑器
  showCodeEditor() {
    this.setData({ showCodeDialog: true });
  },

  // 隐藏代码编辑器
  hideCodeEditor() {
    this.setData({ 
      showCodeDialog: false,
      codeContent: '',
      codeLanguage: 'javascript'
    });
  },

  // 编程语言选择
  onLanguageChange(e) {
    this.setData({ codeLanguage: e.detail.value });
  },

  // 代码输入
  onCodeInput(e) {
    this.setData({ codeContent: e.detail.value });
  },

  // 插入代码到答案
  insertCode() {
    const { codeContent, codeLanguage } = this.data;
    if (!codeContent.trim()) return;

    const codeBlock = `\`\`\`${codeLanguage}\n${codeContent}\n\`\`\`\n`;
    const newContent = this.data.answerContent + codeBlock;
    
    this.setData({
      answerContent: newContent,
      previewContent: this.parseMarkdown(newContent),
      showCodeDialog: false,
      codeContent: '',
      codeLanguage: 'javascript'
    });
  },

  // 格式化文本
  formatText(e) {
    const type = e.currentTarget.dataset.type;
    const formatMap = {
      bold: { prefix: '**', suffix: '**', placeholder: '粗体文本' },
      italic: { prefix: '*', suffix: '*', placeholder: '斜体文本' },
      code: { prefix: '`', suffix: '`', placeholder: '代码' }
    };

    const format = formatMap[type];
    if (!format) return;

    const selection = { start: 0, end: 0 }; // 实际项目中需要获取光标位置
    const { answerContent } = this.data;
    
    const before = answerContent.slice(0, selection.start);
    const selected = answerContent.slice(selection.start, selection.end) || format.placeholder;
    const after = answerContent.slice(selection.end);
    
    const newContent = before + format.prefix + selected + format.suffix + after;
    
    this.setData({
      answerContent: newContent,
      previewContent: this.parseMarkdown(newContent)
    });
  },

  // 插入链接
  insertLink() {
    const { answerContent } = this.data;
    const linkText = '[链接描述](https://example.com)';
    const newContent = answerContent + linkText;
    
    this.setData({
      answerContent: newContent,
      previewContent: this.parseMarkdown(newContent)
    });
  },

  // 显示样式面板
  showStylePanel() {
    wx.showActionSheet({
      itemList: ['标题1', '标题2', '引用', '分割线', '有序列表', '无序列表'],
      success: (res) => {
        const styles = ['# ', '## ', '> ', '---\n', '1. ', '- '];
        const { answerContent } = this.data;
        const newContent = answerContent + styles[res.tapIndex] + '内容';
        
        this.setData({
          answerContent: newContent,
          previewContent: this.parseMarkdown(newContent)
        });
      }
    });
  },

  // 隐藏工具栏
  hideToolbar() {
    setTimeout(() => {
      this.setData({ showToolbar: false });
    }, 200);
  },

  // Markdown解析（简化版）
  parseMarkdown(text) {
    // 实际项目中可以使用更完善的Markdown解析库
    const nodes = [];
    const lines = text.split('\n');
    
    lines.forEach(line => {
      // 代码块检测
      if (line.startsWith('```')) {
        nodes.push({
          name: 'div',
          attrs: { class: 'code-block' },
          children: [{ type: 'text', text: line.substring(3) }]
        });
      }
      // 标题检测
      else if (line.startsWith('# ')) {
        nodes.push({
          name: 'h1',
          children: [{ type: 'text', text: line.substring(2) }]
        });
      }
      // 默认段落
      else if (line.trim()) {
        nodes.push({
          name: 'p',
          children: [{ type: 'text', text: line }]
        });
      }
    });
    
    return nodes;
  },

  // 公开设置
  onPublicChange(e) {
    this.setData({ isPublic: e.detail.value });
  },

  // 评论设置
  onCommentsChange(e) {
    this.setData({ allowComments: e.detail.value });
  },

  // 标签选择
  onTagChange(e) {
    this.setData({ selectedTags: e.detail.value });
  },

  // 保存草稿
  saveDraft() {
    const draft = {
      category: this.data.category,
      questionTitle: this.data.questionTitle,
      questionContent: this.data.questionContent,
      answerContent: this.data.answerContent,
      tags: this.data.selectedTags,
      timestamp: new Date().getTime()
    };

    const draftId = this.data.draftId || `draft_${Date.now()}`;
    wx.setStorageSync(draftId, draft);
    
    this.setData({ draftId });
    
    wx.showToast({
      title: '草稿已保存',
      icon: 'success'
    });
  },

  // 加载草稿
  loadDraft() {
    const keys = Object.keys(wx.getStorageInfoSync());
    const draftKeys = keys.filter(key => key.startsWith('draft_'));
    
    if (draftKeys.length > 0) {
      wx.showModal({
        title: '发现草稿',
        content: '是否加载最近保存的草稿？',
        success: (res) => {
          if (res.confirm) {
            const latestKey = draftKeys[draftKeys.length - 1];
            const draft = wx.getStorageSync(latestKey);
            
            this.setData({
              draftId: latestKey,
              category: draft.category,
              questionTitle: draft.questionTitle,
              questionContent: draft.questionContent,
              answerContent: draft.answerContent,
              selectedTags: draft.tags,
              previewContent: this.parseMarkdown(draft.answerContent)
            });
          }
        }
      });
    }
  },

  // 加载问题数据
  loadQuestion(id) {
    // 实际项目中从服务器加载数据
    wx.showLoading({ title: '加载中...' });
    
    setTimeout(() => {
      const mockData = {
        category: 'frontend',
        questionTitle: '如何优化小程序性能？',
        questionContent: '我的小程序在低端手机上运行很卡顿...',
        answerContent: '可以通过以下方式优化：\n\n1. 图片懒加载\n2. 数据分页加载\n3. 减少setData调用',
        tags: ['performance', 'mini-program']
      };
      
      this.setData({
        ...mockData,
        previewContent: this.parseMarkdown(mockData.answerContent)
      });
      
      wx.hideLoading();
    }, 500);
  },

  // 验证表单
  validateForm() {
    if (!this.data.category) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return false;
    }
    
    if (!this.data.questionTitle.trim()) {
      wx.showToast({ title: '请输入问题标题', icon: 'none' });
      return false;
    }
    
    if (!this.data.questionContent.trim()) {
      wx.showToast({ title: '请输入问题描述', icon: 'none' });
      return false;
    }
    
    if (!this.data.answerContent.trim()) {
      wx.showToast({ title: '请输入解决方案', icon: 'none' });
      return false;
    }
    
    return true;
  },

  // 发布问答
  handlePublish() {
    if (!this.validateForm()) return;

    wx.showLoading({ title: '发布中...' });

    // 模拟发布请求
    setTimeout(() => {
      const questionData = {
        category: this.data.category,
        title: this.data.questionTitle,
        content: this.data.questionContent,
        answer: this.data.answerContent,
        tags: this.data.selectedTags,
        isPublic: this.data.isPublic,
        allowComments: this.data.allowComments,
        publishTime: new Date().toISOString()
      };

      // 保存到本地（实际项目中应发送到服务器）
      const questions = wx.getStorageSync('published_questions') || [];
      questions.unshift(questionData);
      wx.setStorageSync('published_questions', questions);

      // 清除草稿
      if (this.data.draftId) {
        wx.removeStorageSync(this.data.draftId);
      }

      wx.hideLoading();
      
      wx.showModal({
        title: '发布成功',
        content: '技术问答已成功发布！',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }, 1500);
  },

  onUnload() {
    // 页面卸载时自动保存草稿
    if (this.data.questionTitle || this.data.questionContent || this.data.answerContent) {
      this.saveDraft();
    }
  }
});