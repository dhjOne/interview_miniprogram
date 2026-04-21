import { authApi as questionApi } from '~/api/request/api_question';
import { authApi as categoryApi } from '~/api/request/api_category';
import { CategoryParams } from '~/api/param/param_category';
import { QuestionPublishParams } from '~/api/param/param_publish';
import { QuestionParams } from '~/api/param/param_question';
// 获取应用实例
const app = getApp();

Page({
  data: {
    // 表单数据
    docTitle: '',
    markdownContent: '',
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
    
    /** 一级分类（与 pages/category 相同接口：parentId=0） */
    categoryLevel1: [],
    /** 当前一级下的二级分类 */
    categoryLevel2: [],
    /** 当前选中的一级 id */
    selectedParentCategory: '',

    /** 编辑已有文档时的 id；新建为空 */
    editDocId: null,
    
    // towxml 渲染数据
    renderedContent: null,
    
    // 字数统计
    wordCount: 0,
    
    // 完整的预览内容（包含标题和分类）
    previewFullContent: '',
    
    // 分类名称缓存
    categoryName: '',
    
    // 最近插入的内容类型（用于反馈）
    lastInsertType: '',
    
    // 编辑模式滚动相关
    editorScrollTop: 0,
    editorAutoScroll: false,
    lastScrollPosition: 0,
    isScrolling: false,
    
    // 编辑器行数跟踪
    editorLineCount: 1,
    
    // 记录插入操作
    insertOperations: []
  },

  _unwrapPublishDetail(res) {
    if (!res || typeof res !== 'object') return {};
    const d = res.data !== undefined ? res.data : res;
    if (d && typeof d === 'object' && d.data !== undefined && d.title === undefined && d.content === undefined) {
      return d.data || {};
    }
    return d;
  },

  _categoryRowsFromResponse(res) {
    const d = res && typeof res === 'object' ? res.data : undefined;
    if (Array.isArray(d?.rows)) return d.rows;
    if (Array.isArray(res?.rows)) return res.rows;
    if (Array.isArray(d)) return d;
    return [];
  },

  async fetchSubCategories(parentId) {
    const categoryParams = new CategoryParams(null, parentId);
    categoryParams.sortField = 'sort_order';
    categoryParams.order = 'asc';
    const response = await categoryApi.getCategories(categoryParams);
    return this._categoryRowsFromResponse(response);
  },

  /** 与 pages/category 一致：拉取一级分类（categoryId = 0） */
  async loadLevel1Categories() {
    try {
      const rows = await this.fetchSubCategories(0);
      this.setData({ categoryLevel1: rows });
    } catch (e) {
      console.error('loadLevel1Categories', e);
      wx.showToast({ title: '分类加载失败', icon: 'none' });
      this.setData({ categoryLevel1: [] });
    }
  },

  /**
   * 根据 categoryId 解析一级/二级选中态（供详情回显与旧草稿兼容）
   * @returns {Promise<object|null>} setData 用的 patch，或 null
   */
  async resolveCategorySelection(categoryId, fallbackName) {
    if (categoryId === undefined || categoryId === null || String(categoryId).trim() === '') {
      return null;
    }
    const idStr = String(categoryId);
    const rows1 = this.data.categoryLevel1 || [];
    if (!rows1.length) {
      return fallbackName
        ? {
            selectedParentCategory: '',
            categoryLevel2: [],
            selectedCategory: categoryId,
            categoryName: fallbackName
          }
        : null;
    }

    const results = await Promise.all(
      rows1.map(async (p) => ({ p, sub: await this.fetchSubCategories(p.id) }))
    );

    for (const { p, sub } of results) {
      const child = sub.find((c) => String(c.id) === idStr);
      if (child) {
        return {
          selectedParentCategory: p.id,
          categoryLevel2: sub,
          selectedCategory: child.id,
          categoryName: `${p.name} / ${child.name}`
        };
      }
    }

    const hit1 = rows1.find((c) => String(c.id) === idStr);
    if (hit1) {
      const sub = results.find((r) => String(r.p.id) === idStr)?.sub || [];
      const leafId = sub.length ? '' : hit1.id;
      const categoryName =
        sub.length && fallbackName ? fallbackName : hit1.name;
      return {
        selectedParentCategory: hit1.id,
        categoryLevel2: sub,
        selectedCategory: leafId,
        categoryName
      };
    }

    if (fallbackName) {
      return {
        selectedParentCategory: '',
        categoryLevel2: [],
        selectedCategory: categoryId,
        categoryName: fallbackName
      };
    }
    return null;
  },

  /** 根据详情里的 categoryId 回显一级、二级 */
  async applyDetailCategory(categoryId, fallbackName) {
    const patch = await this.resolveCategorySelection(categoryId, fallbackName);
    if (patch) {
      this.setData(patch, () => this.updatePreviewContent());
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
      wx.showToast({ title: e?.message || '加载失败', icon: 'none' });
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

  // 初始化编辑器（新建；编辑走 loadDocForEdit）
  async initEditor() {
    wx.setNavigationBarTitle({ title: '发布文档' });
    await this.loadDraft();

    if (!this.data.markdownContent) {
      this.setData({
        markdownContent: '# 欢迎使用技术文档编辑器\n\n这是一个支持Markdown实时预览的编辑器，您可以开始撰写您的技术文档。'
      }, () => {
        this.updatePreviewContent();
      });
    }
  },

  // 标题输入
  onTitleChange(e) {
    const title = e.detail.value.trim();
    this.setData({
      docTitle: title
    }, () => {
      this.updatePreviewContent();
    });
  },

  // 内容输入
  onContentChange(e) {
    const content = e.detail.value;
    const wordCount = content.length;
    
    this.setData({
      markdownContent: content,
      wordCount: wordCount
    }, () => {
      this.updatePreviewContent();
      
      // 检查是否需要自动滚动
      this.checkAutoScroll();
    });
    
    // 保存到历史记录
    this.saveToHistory(content);
    
    // 自动保存草稿
    this.autoSaveDraft();
  },

  // 保存到历史记录
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
        markdownContent: content,
        historyIndex: newIndex,
        canUndo: newIndex > 0,
        canRedo: true
      }, () => {
        this.updatePreviewContent();
        // 撤销后滚动到适当位置
        setTimeout(() => {
          this.scrollToCursor();
        }, 100);
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
        markdownContent: content,
        historyIndex: newIndex,
        canUndo: true,
        canRedo: newIndex < contentHistory.length - 1
      }, () => {
        this.updatePreviewContent();
        // 重做后滚动到适当位置
        setTimeout(() => {
          this.scrollToCursor();
        }, 100);
      });
    }
  },

  /** 选择一级：有二级则清空已选叶子，仅展示二级；无二级则一级即发布分类 */
  async onSelectLevel1(e) {
    const parentId = e.currentTarget.dataset.id;
    if (parentId === undefined || parentId === null) return;
    const sub = await this.fetchSubCategories(parentId);
    const parent = this.data.categoryLevel1.find(
      (p) => String(p.id) === String(parentId)
    );
    const patch = {
      selectedParentCategory: parentId,
      categoryLevel2: sub
    };
    if (!sub.length) {
      patch.selectedCategory = parentId;
      patch.categoryName = parent ? parent.name : '';
    } else {
      patch.selectedCategory = '';
      patch.categoryName = '';
    }
    this.setData(patch, () => this.updatePreviewContent());
  },

  /** 选择二级：提交用二级 id，预览展示「一级 / 二级」 */
  onSelectLevel2(e) {
    const id = e.currentTarget.dataset.id;
    const parent = this.data.categoryLevel1.find(
      (p) => String(p.id) === String(this.data.selectedParentCategory)
    );
    const child = this.data.categoryLevel2.find((c) => String(c.id) === String(id));
    const categoryName =
      parent && child ? `${parent.name} / ${child.name}` : child?.name || '';
    this.setData(
      {
        selectedCategory: id,
        categoryName
      },
      () => this.updatePreviewContent()
    );
  },

  // 切换标签页
  onTabChange(e) {
    this.setData({
      activeTab: e.detail.value
    });
    
    // 切换到编辑模式时，滚动到底部
    if (e.detail.value === 'edit') {
      setTimeout(() => {
        this.scrollToBottom();
      }, 200);
    }
  },

  // 构建完整的预览内容
  buildFullPreviewContent() {
    const { docTitle, categoryName, markdownContent } = this.data;
    
    let fullContent = '';
    
    // 1. 标题部分 - 使用 HTML 实现标题居中和分类右对齐
    if (docTitle) {
      fullContent += `<div style="text-align: center; margin-bottom: 40rpx;">\n`;
      fullContent += `  <h1 style="font-size: 48rpx; font-weight: 700; color: #1d2129; margin: 0;">${docTitle}</h1>\n`;
      
      // 2. 分类标签 - 如果存在分类，右对齐且无间距
      if (categoryName) {
        fullContent += `  <div style="text-align: right; margin: 0;">\n`;
        fullContent += `    <span style="background: #165dff; color: white; padding: 4rpx 16rpx; border-radius: 16rpx; font-size: 24rpx; display: inline-block;">${categoryName}</span>\n`;
        fullContent += `  </div>\n`;
      }
      fullContent += `</div>\n\n`;
    } else {
      // 如果没有标题，显示占位符
      fullContent += `<div style="text-align: center; margin-bottom: 40rpx;">\n`;
      fullContent += `  <h1 style="font-size: 48rpx; font-weight: 700; color: #c9cdd4; margin: 0;">未命名文档</h1>\n`;
      fullContent += `</div>\n\n`;
    }
    
    // 3. 文档内容 - 直接开始文档内容，没有分割线
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

  // 更新预览内容
  updatePreviewContent() {
    const fullContent = this.buildFullPreviewContent();
    
    this.setData({
      previewFullContent: fullContent
    });
    
    // 使用 towxml 渲染
    if (app.towxml && fullContent) {
      try {
        const renderData = app.towxml(fullContent, 'markdown', {
          theme: 'light',
          base: '',
          events: {}
        });
        
        this.setData({
          renderedContent: renderData
        });
        
        console.log('预览已更新，内容长度:', fullContent.length);
      } catch (error) {
        console.error('Markdown 渲染错误:', error);
      }
    }
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

  // 插入 Markdown 语法 - 插入到文档末尾并自动滚动
  insertMarkdown(e) {
    this.closeToolbarDropdown();
    
    const type = e.currentTarget.dataset.type;
    const { markdownContent } = this.data;
    
    let insertText = '';
    let insertTypeName = '';
    
    switch (type) {
      case 'h1':
        insertText = '\n\n# 一级标题\n\n这里是标题内容...';
        insertTypeName = '一级标题';
        break;
      case 'h2':
        insertText = '\n\n## 二级标题\n\n这里是二级标题内容...';
        insertTypeName = '二级标题';
        break;
      case 'h3':
        insertText = '\n\n### 三级标题\n\n这里是三级标题内容...';
        insertTypeName = '三级标题';
        break;
      case 'bold':
        insertText = '\n\n**这里是粗体文字**';
        insertTypeName = '粗体文字';
        break;
      case 'italic':
        insertText = '\n\n*这里是斜体文字*';
        insertTypeName = '斜体文字';
        break;
      case 'list':
        insertText = '\n\n- 列表项一\n- 列表项二\n- 列表项三';
        insertTypeName = '无序列表';
        break;
      case 'ordered-list':
        insertText = '\n\n1. 列表项一\n2. 列表项二\n3. 列表项三';
        insertTypeName = '有序列表';
        break;
      case 'quote':
        insertText = '\n\n> 这里是引用内容\n> 可以多行显示引用内容';
        insertTypeName = '引用块';
        break;
      case 'inline-code':
        insertText = '\n\n`这里是行内代码`';
        insertTypeName = '行内代码';
        break;
      case 'code':
        insertText = '\n\n```javascript\n// 这里是代码块\nfunction example() {\n  console.log("Hello World");\n}\n```';
        insertTypeName = '代码块';
        break;
      case 'link':
        insertText = '\n\n[链接文字](https://example.com)';
        insertTypeName = '超链接';
        break;
      case 'table':
        insertText = '\n\n| 标题1 | 标题2 | 标题3 |\n|-------|-------|-------|\n| 内容1 | 内容2 | 内容3 |\n| 内容4 | 内容5 | 内容6 |';
        insertTypeName = '表格';
        break;
      case 'divider':
        insertText = '\n\n---\n\n';
        insertTypeName = '分割线';
        break;
      case 'checklist':
        insertText = '\n\n- [ ] 任务项一\n- [ ] 任务项二\n- [x] 已完成任务';
        insertTypeName = '任务列表';
        break;
      case 'formula':
        insertText = '\n\n$$\ne^{i\\pi} + 1 = 0\n$$\n\n这是一个数学公式示例。';
        insertTypeName = '数学公式';
        break;
      case 'mermaid':
        insertText = '\n\n```mermaid\ngraph TD\n    A[开始] --> B(处理)\n    B --> C{判断}\n    C -->|是| D[结束]\n    C -->|否| B\n```';
        insertTypeName = '流程图';
        break;
    }
    
    // 插入到文档末尾
    const newContent = markdownContent + insertText;
    
    this.setData({
      markdownContent: newContent,
      lastInsertType: insertTypeName,
      cursorPosition: markdownContent.length
    }, () => {
      this.updatePreviewContent();
      this.saveToHistory(newContent);
      
      // 插入后自动滚动到底部
      setTimeout(() => {
        this.scrollToBottom();
      }, 100);
      
      // 显示插入成功的提示
      wx.showToast({
        title: `已插入${insertTypeName}到文档末尾`,
        icon: 'success',
        duration: 1500
      });
      
      console.log(`插入${insertTypeName}到文档末尾，新内容长度:`, newContent.length);
    });
  },

  // 插入模板 - 插入到文档末尾并自动滚动
  insertTemplate(e) {
    this.closeToolbarDropdown();
    
    const type = e.currentTarget.dataset.type;
    const { markdownContent } = this.data;
    
    let insertText = '';
    let insertTypeName = '';
    
    switch (type) {
      case 'tutorial':
        insertText = '\n\n# 使用教程模板\n\n## 概述\n\n在这里描述您的产品/技术的背景和目的...\n\n## 安装步骤\n\n### 1. 环境准备\n\n确保您的系统满足以下要求：\n\n- Node.js 14.0 或更高版本\n- npm 6.0 或更高版本\n\n### 2. 安装命令\n\n```bash\nnpm install your-package --save\n```\n\n## 快速开始\n\n### 基本配置\n\n1. 导入模块\n2. 初始化配置\n3. 开始使用\n\n### 示例代码\n\n```javascript\nconst yourModule = require(\'your-package\');\n\n// 初始化\nconst instance = yourModule.init({\n  apiKey: \'your-api-key\',\n  endpoint: \'https://api.example.com\'\n});\n\n// 使用功能\ninstance.doSomething();\n```\n\n## 注意事项\n\n> 重要提示：在生产环境使用前，请确保充分测试。\n\n## 常见问题\n\n**Q: 如何解决常见错误？**\nA: 检查网络连接和配置参数。\n\n**Q: 如何获取支持？**\nA: 请访问我们的官方文档或联系技术支持。';
        insertTypeName = '教程模板';
        break;
      case 'api':
        insertText = '\n\n# API 文档模板\n\n## 接口概览\n\n| 接口名称 | 请求方法 | 接口路径 | 描述 | 认证要求 |\n|----------|----------|----------|------|----------|\n| 获取用户 | GET | /api/users | 获取用户列表 | 需要token |\n| 创建用户 | POST | /api/users | 创建新用户 | 需要token |\n| 用户详情 | GET | /api/users/:id | 获取用户详情 | 需要token |\n| 更新用户 | PUT | /api/users/:id | 更新用户信息 | 需要token |\n| 删除用户 | DELETE | /api/users/:id | 删除用户 | 需要token |\n\n## 通用说明\n\n### 请求头\n\n```http\nAuthorization: Bearer {token}\nContent-Type: application/json\nAccept: application/json\n```\n\n### 请求示例\n\n```bash\ncurl -X GET \\\n  "https://api.example.com/users" \\\n  -H "Authorization: Bearer your-token-here" \\\n  -H "Content-Type: application/json"\n```\n\n### 响应格式\n\n所有响应都遵循以下格式：\n\n```json\n{\n  "code": 200,\n  "data": {},\n  "message": "success",\n  "timestamp": 1640995200000\n}\n```\n\n### 参数说明\n\n| 参数名 | 类型 | 必填 | 说明 | 示例 |\n|--------|------|------|------|------|\n| page   | number | 否 | 页码，从1开始 | 1 |\n| size   | number | 否 | 每页数量，默认20 | 20 |\n| sort   | string | 否 | 排序字段 | "createdAt:desc" |\n\n### 错误码\n\n| 错误码 | 说明 |\n|--------|------|\n| 400 | 请求参数错误 |\n| 401 | 未授权 |\n| 403 | 权限不足 |\n| 404 | 资源不存在 |\n| 500 | 服务器内部错误 |';
        insertTypeName = 'API文档模板';
        break;
      case 'code':
        insertText = '\n\n```javascript\n// 代码模板\n\n/**\n * 函数名称\n * @param {string} param1 - 参数1描述\n * @param {number} param2 - 参数2描述\n * @returns {boolean} 返回值描述\n * @example\n * // 示例用法\n * const result = functionName(\'hello\', 123);\n */\nfunction functionName(param1, param2) {\n  // 函数实现\n  console.log(`参数1: ${param1}, 参数2: ${param2}`);\n  \n  // 返回结果\n  return true;\n}\n\n// 使用示例\nconst example = functionName(\'test\', 456);\nconsole.log(\'执行结果:\', example);\n```';
        insertTypeName = '代码模板';
        break;
      case 'table':
        insertText = '\n\n| 参数名 | 类型 | 必填 | 默认值 | 说明 | 示例 |\n|--------|------|------|--------|------|------|\n| id     | string | 是 | 无 | 唯一标识 | "user_123" |\n| name   | string | 是 | 无 | 用户姓名 | "张三" |\n| age    | number | 否 | 18 | 用户年龄 | 25 |\n| email  | string | 是 | 无 | 用户邮箱 | "user@example.com" |\n| status | string | 否 | "active" | 用户状态 | "active", "inactive" |\n| createdAt | string | 否 | 无 | 创建时间 | "2024-01-23T10:30:00Z" |\n| updatedAt | string | 否 | 无 | 更新时间 | "2024-01-23T11:00:00Z" |';
        insertTypeName = '表格模板';
        break;
    }
    
    // 插入到文档末尾
    const newContent = markdownContent + insertText;
    
    this.setData({
      markdownContent: newContent,
      lastInsertType: insertTypeName,
      cursorPosition: markdownContent.length
    }, () => {
      this.updatePreviewContent();
      this.saveToHistory(newContent);
      
      // 插入后自动滚动到底部
      setTimeout(() => {
        this.scrollToBottom();
      }, 100);
      
      // 显示插入成功的提示
      wx.showToast({
        title: `已插入${insertTypeName}到文档末尾`,
        icon: 'success',
        duration: 1500
      });
      
      console.log(`插入${insertTypeName}到文档末尾，新内容长度:`, newContent.length);
    });
  },

  // 选择图片 - 插入到文档末尾并自动滚动
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
        
        // 插入图片 Markdown 到文档末尾
        const imageMarkdown = newImages.map(img => `\n\n![图片${index + 1}](${img.url})`).join('\n');
        const { markdownContent } = this.data;
        const newContent = markdownContent + imageMarkdown;
        
        this.setData({
          markdownContent: newContent,
          lastInsertType: '图片',
          cursorPosition: newContent.length
        }, () => {
          this.updatePreviewContent();
          this.saveToHistory(newContent);
          
          // 插入后自动滚动到底部
          setTimeout(() => {
            this.scrollToBottom();
          }, 100);
          
          wx.showToast({
            title: `已插入${newImages.length}张图片到文档末尾`,
            icon: 'success',
            duration: 1500
          });
        });
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

  // 编辑器行变化事件
  onEditorLineChange(e) {
    const lineCount = e.detail.lineCount;
    this.setData({
      editorLineCount: lineCount
    });
  },

  // 编辑器确认事件
  onEditorConfirm(e) {
    // 回车时自动滚动
    setTimeout(() => {
      this.scrollToCursor();
    }, 50);
  },

  // 编辑器滚动事件
  onEditorScroll(e) {
    const scrollTop = e.detail.scrollTop;
    this.setData({
      lastScrollPosition: scrollTop,
      isScrolling: true
    });
    
    // 如果用户主动滚动，暂时关闭自动滚动
    if (this.autoScrollTimer) {
      clearTimeout(this.autoScrollTimer);
    }
    
    this.autoScrollTimer = setTimeout(() => {
      this.setData({
        isScrolling: false
      });
    }, 2000);
  },

  // 滚动到光标位置
  scrollToCursor() {
    if (this.data.isScrolling) return;
    
    // 计算大致的滚动位置
    const cursorPos = this.data.cursorPosition;
    const content = this.data.markdownContent;
    const linesBeforeCursor = content.substring(0, cursorPos).split('\n').length;
    
    // 每行大约30像素，加上一些边距
    const estimatedScrollTop = Math.max(0, linesBeforeCursor * 30 - 200);
    
    this.setData({
      editorScrollTop: estimatedScrollTop,
      editorAutoScroll: true
    });
    
    // 3秒后隐藏自动滚动提示
    setTimeout(() => {
      this.setData({
        editorAutoScroll: false
      });
    }, 3000);
  },

  // 滚动到底部
  scrollToBottom() {
    if (this.data.isScrolling) return;
    
    // 设置一个很大的值，确保滚动到底部
    this.setData({
      editorScrollTop: 999999,
      editorAutoScroll: true
    });
    
    // 3秒后隐藏自动滚动提示
    setTimeout(() => {
      this.setData({
        editorAutoScroll: false
      });
    }, 3000);
  },

  // 检查是否需要自动滚动
  checkAutoScroll() {
    // 如果用户最近没有滚动，并且光标在文档末尾附近，自动滚动
    const cursorPos = this.data.cursorPosition;
    const contentLength = this.data.markdownContent.length;
    const isNearEnd = cursorPos > contentLength * 0.8;
    
    if (isNearEnd && !this.data.isScrolling) {
      setTimeout(() => {
        this.scrollToCursor();
      }, 100);
    }
  },

  // 显示清除确认弹窗
  showClearConfirmDialog() {
    this.closeToolbarDropdown();
    
    if (!this.data.markdownContent.trim() && !this.data.docTitle.trim()) {
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
      docTitle: '',
      markdownContent: '',
      selectedCategory: '',
      selectedParentCategory: '',
      categoryLevel2: [],
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
      editorAutoScroll: false
    });
    
    // 清除草稿
    wx.removeStorageSync('markdown_draft');
    
    wx.showToast({
      title: '内容已清除',
      icon: 'success',
      duration: 2000
    });
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
      const response = await questionApi.publishQuestion(publishParams);
      if (response && response.code === '0000') {
        wx.showToast({
          title: '草稿已保存',
          icon: 'success',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: (response && response.message) || '保存失败',
          icon: 'none',
          duration: 2000
        });
      }
    } catch (error) {
      wx.showToast({
        title: error?.message || '保存失败，请重试',
        icon: 'none',
        duration: 2000
      });
    } finally {
      wx.hideLoading();
    }
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
  async loadDraft() {
    const draft = wx.getStorageSync('markdown_draft');
    if (!draft) return;

    const base = {
      docTitle: draft.docTitle || '',
      markdownContent: draft.markdownContent || '',
      images: draft.images || [],
      previewFullContent: draft.previewFullContent || ''
    };

    let categoryPatch = {
      selectedCategory: '',
      selectedParentCategory: '',
      categoryLevel2: [],
      categoryName: ''
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
        const p = (this.data.categoryLevel1 || []).find(
          (x) => String(x.id) === String(parentId)
        );
        const c = categoryLevel2.find(
          (x) => String(x.id) === String(draft.selectedCategory)
        );
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
        categoryName
      };
    } else if (draft.selectedCategory) {
      const resolved = await this.resolveCategorySelection(
        draft.selectedCategory,
        draft.categoryName || ''
      );
      if (resolved) {
        categoryPatch = resolved;
      }
    }

    this.setData(
      {
        ...base,
        ...categoryPatch
      },
      () => {
        this.updatePreviewContent();
        setTimeout(() => {
          this.scrollToBottom();
        }, 300);
      }
    );
  },

  // 验证表单
  validateForm() {
    if (!this.data.docTitle.trim()) {
      wx.showToast({
        title: '请填写文档标题',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    if (this.data.docTitle.length < 2) {
      wx.showToast({
        title: '标题至少需要2个字',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    if (!this.data.selectedParentCategory) {
      wx.showToast({
        title: '请选择一级分类',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    const hasL2 = (this.data.categoryLevel2 || []).length > 0;
    if (hasL2 && !this.data.selectedCategory) {
      wx.showToast({
        title: '请选择二级分类',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    if (!hasL2 && !this.data.selectedCategory) {
      wx.showToast({
        title: '请选择文档分类',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    if (!this.data.markdownContent.trim()) {
      wx.showToast({
        title: '请填写文档内容',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    if (this.data.markdownContent.length < 10) {
      wx.showToast({
        title: '内容至少需要10个字',
        icon: 'none',
        duration: 2000
      });
      return false;
    }
    
    return true;
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
    const isEdit = this.data.editDocId ? true : false;

    wx.showLoading({
      title: isEdit ? '保存中…' : '发布中…',
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
        operationType // 操作类型：update(修改)|publish(发布)
      );
      const response = await questionApi.publishQuestion(publishParams);
      if (response && response.code === '0000') {
        wx.removeStorageSync('markdown_draft');
        wx.showToast({
          title: isEdit ? '保存成功' : '发布成功',
          icon: 'success',
          duration: 1800
        });

        if (isEdit) {
          this.setData({ isPublishing: false, editDocId: null });
          wx.navigateBack({ delta: 1 });
          return;
        }

        this.setData({
          docTitle: '',
          markdownContent: '',
          selectedCategory: '',
          selectedParentCategory: '',
          categoryLevel2: [],
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
      } else {
        wx.showToast({
          title: (response && response.message) || '操作失败',
          icon: 'none',
          duration: 2000
        });
      }
    } catch (error) {
      wx.showToast({
        title: error?.message || '操作失败，请重试',
        icon: 'none',
        duration: 2000
      });
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