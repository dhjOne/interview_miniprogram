import Message from 'tdesign-miniprogram/message/index';
import {
  authApi
} from '~/api/request/api_question';
import { socialApi } from '~/api/request/api_social';
import {
  QuestionLikeOrCollectParams,
  QuestionParams
} from '~/api/param/param_question';
import {
  resolveAuthorAvatar,
  resolveAuthorDisplayName,
  resolveAuthorFollowing,
  resolveAuthorId
} from '~/utils/author';
import { recordQuestionBrowse } from '~/utils/questionBrowseHistory';

const { renderMarkdown } = require('../../../utils/towxmlLoader');

Page({
  data: {
    questionId: null,
    questionDetail: {},
    relatedQuestions: [],
    comments: [],
    commentCount: 0,
    commentText: '',
    showActionBar: true,
    scrollTop: 0,

    categoryId: null,
    categoryName: '',
    catalogTitle: '题目目录',
    catalogList: [],
    catalogLoading: false,
    catalogLoaded: false,
    showCatalog: false,

    authorId: '',
    authorDisplayName: '题目作者',
    authorFollowing: false,

    showCommentPanel: false,

    // 新增状态字段
    loading: true, // 加载中
    error: false, // 错误状态
    errorMessage: '', // 错误信息
    isEmpty: false, // 空数据状态

    // 分享相关状态
    showShareActionSheet: false, // 分享操作面板
    showCustomGuide: false, // 使用自定义引导弹窗

    shareOptions: [{
      label: '刷新',
      icon: 'refresh',
      value: 'refresh'
    },
    {
      label: '复制',
      icon: 'queue',
      value: 'copy'
    },
    {
      label: '朋友圈',
      image: 'https://tdesign.gtimg.com/mobile/demos/times.png',
      value: 'moment'
    },
    {
      label: '微信',
      image: 'https://tdesign.gtimg.com/mobile/demos/wechat.png',
      value: 'wechat'
    }
    ],
    contentBlocks: [], // 内容块数组
    blockStyles: {}, // 块样式配置
    currentTheme: 'default', // 当前主题

    // 新增：towxml 相关字段
    isMarkdown: false, // 是否为 markdown 内容
    towxmlData: null, // towxml 解析后的数据
    towxmlOptions: {
      // towxml 配置选项
      theme: 'light', // 主题：light/dark
      events: {
        // 图片点击事件
        tap: (e) => {
          const { dataset } = e.currentTarget;
          if (dataset.src) {
            wx.previewImage({
              current: dataset.src,
              urls: [dataset.src]
            });
          }
        },
        // 链接点击事件
        linktap: (e) => {
          const { href } = e.currentTarget.dataset;
          console.log('链接点击:', href);
          // 可以在这里处理链接跳转
        }
      }
    }

  },

  onLoad(options) {
    console.log('题目详情页面加载', options);
    const { id, categoryId, categoryName, title } = options;
    if (!id) {
      this.setData({
        loading: false,
        error: true,
        errorMessage: '题目ID不能为空'
      });
      return;
    }

    const decodedCategoryName = categoryName ? decodeURIComponent(categoryName) : '';
    const decodedTitle = title ? decodeURIComponent(title) : '';

    this.setData({
      questionId: id,
      categoryId: categoryId || null,
      categoryName: decodedCategoryName,
      catalogTitle: decodedCategoryName || '题目目录'
    });

    if (decodedTitle) {
      wx.setNavigationBarTitle({ title: decodedTitle });
    }

    this.loadQuestionDetail();
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 加载题目详情
  async loadQuestionDetail() {
    try {
      this.setData({
        loading: true,
        error: false,
        isEmpty: false,
        isMarkdown: false,
        towxmlData: null
      });
      
      const questionDetail = new QuestionParams(null, null, this.data.questionId)
      const response = await authApi.getQuestionDetail(questionDetail);
      
      if (response.data) {
        const questionDetail = response.data;
        
        // 判断内容类型
        const isMarkdownContent = questionDetail.contentType === 'markdown';
        
        const authorId = resolveAuthorId(questionDetail);
        let authorDisplayName = resolveAuthorDisplayName(questionDetail, '题目作者');
        const patch = {
          questionDetail,
          loading: false,
          isMarkdown: isMarkdownContent,
          authorId,
          authorDisplayName,
          authorFollowing: resolveAuthorFollowing(questionDetail),
          catalogLoaded: false
        };
        if (!this.data.categoryId && questionDetail.categoryId) {
          patch.categoryId = questionDetail.categoryId;
        }
        if (questionDetail.categoryName) {
          patch.catalogTitle = questionDetail.categoryName;
        }

        this.setData(patch);

        try {
          recordQuestionBrowse({
            id: questionDetail.id ?? this.data.questionId,
            title: questionDetail.title
          });
        } catch (e) {
          // 本地浏览记录失败不影响详情页
        }

        this.loadComments();
        
        // 根据内容类型选择渲染方式
        if (isMarkdownContent) {
          // 使用 towxml 渲染 markdown
          this.renderMarkdownWithTowxml(questionDetail);
        } else {
          // 使用现有的 contentBlocks 渲染
          this.renderWithContentBlocks(questionDetail);
        }
        
        // 设置页面标题
        // wx.setNavigationBarTitle({
        //   title: questionDetail.title || '题目详情'
        // });
      } else {
        // 数据为空
        this.setData({
          loading: false,
          error: false,
          isEmpty: true
        });
      }
    } catch (error) {
      console.error('加载题目详情失败:', error);
      this.setData({
        loading: false,
        error: true,
        errorMessage: '网络错误，请重试'
      });
    }
  },

  // 使用 contentBlocks 渲染
  renderWithContentBlocks(questionDetail) {
    const contentBlocks = questionDetail.contentList || [];
    console.log('contentBlocks::::', contentBlocks)
    
    this.setData({
      contentBlocks: this.processContentBlocks(contentBlocks)
    });
    
    // 检查最终设置的数据
    console.log('设置后的 contentBlocks:', this.data.contentBlocks);
  },

  // 使用 towxml 渲染 markdown
  renderMarkdownWithTowxml(questionDetail) {
    const markdownContent = questionDetail.content || questionDetail.previewFullContent || '';

    if (!markdownContent) {
      console.warn('Markdown 内容为空');
      this.setData({ contentBlocks: [] });
      return;
    }

    console.log('开始解析 markdown 内容，长度:', markdownContent.length);

    renderMarkdown(markdownContent, {
      theme: this.data.towxmlOptions.theme,
      events: this.data.towxmlOptions.events,
      base: 'https://example.com',
      highlight: true,
      showImageMenu: true,
      customizeStyle: true,
    })
      .then((towxmlData) => {
        if (!towxmlData) {
          throw new Error('towxml 解析结果为空');
        }
        console.log('towxml 解析完成:', towxmlData);
        this.setData({
          towxmlData,
          contentBlocks: [],
        });
      })
      .catch((error) => {
      console.error('解析 markdown 失败:', error);
      // 如果解析失败，尝试降级使用 contentList
      if (questionDetail.contentList && questionDetail.contentList.length > 0) {
        console.warn('Markdown 解析失败，尝试使用 contentList 渲染');
        this.renderWithContentBlocks(questionDetail);
      } else {
        this.setData({
          error: true,
          errorMessage: '内容解析失败'
        });
      }
      });
  },

  // 点击分享按钮
  onShare() {
    this.setData({
      showShareActionSheet: true
    });
  },

  // 分享选项选择
  onShareOptionSelect(event) {
    const {
      selected
    } = event.detail;
    const option = this.data.shareOptions[selected.index];

    // 关闭 ActionSheet
    this.setData({
      showShareActionSheet: false
    });

    console.log("根据选项执行不同操作", selected.value);

    // 根据选项执行不同操作
    switch (selected.value) {
      case 'copy':
        this.copyLink();
        break;
      case 'wechat':
        // 延迟显示自定义引导，确保 ActionSheet 完全关闭
        setTimeout(() => {
          this.showCustomGuide();
        }, 300);
        break;
      case 'moment':
        this.shareToMoment();
        break;
      case 'refresh':
        this.refreshPage();
        break;
      default:
        break;
    }
  },

  // 关闭分享 ActionSheet
  onShareActionSheetClose() {
    console.log('关闭 ActionSheet');
    this.setData({
      showShareActionSheet: false
    });
  },

  // 显示自定义引导弹窗
  showCustomGuide() {
    this.setData({
      showCustomGuide: true
    });
  },

  // 关闭自定义引导
  onCloseCustomGuide() {
    this.setData({
      showCustomGuide: false
    });
  },

  // 复制链接
  copyLink() {
    const link = `pages/question/detail/index?id=${this.data.questionId}`;
    wx.setClipboardData({
      data: link,
      success: () => {
        Message.success({
          content: '链接已复制到剪贴板',
          duration: 2000
        });
      }
    });
  },

  // 分享到朋友圈
  shareToMoment() {
    this.setData({
      showCustomGuide: true
    });
  },

  // 刷新页面
  refreshPage() {
    this.setData({
      loading: true,
      error: false,
      errorMessage: '',
      isEmpty: false,
      isMarkdown: false,
      towxmlData: null,
      contentBlocks: [],
      catalogLoaded: false,
      catalogList: [],
      showCatalog: false,
      showCommentPanel: false
    });
    this.loadQuestionDetail();
  },

  // 重新加载
  retryLoad() {
    this.setData({
      loading: true,
      error: false,
      errorMessage: '',
      isEmpty: false,
      isMarkdown: false,
      towxmlData: null,
      contentBlocks: [],
      catalogLoaded: false,
      catalogList: [],
      showCatalog: false,
      showCommentPanel: false
    });
    this.loadQuestionDetail();
  },


  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 评论相关方法
  onCommentChange(event) {
    this.setData({
      commentText: event.detail.value
    });
  },

  async loadComments() {
    try {
      const response = await authApi.getQuestionComments({
        questionId: this.data.questionId
      });
      const rows = response.data?.rows ?? response.data?.list ?? response.data ?? [];
      this.setData({
        comments: Array.isArray(rows) ? rows : []
      });
    } catch (e) {
      console.warn('加载评论失败', e);
    }
  },

  async loadCatalog() {
    this.setData({ catalogLoading: true });
    try {
      let rows = [];
      if (this.data.categoryId) {
        const questionParams = new QuestionParams(null, this.data.categoryId, null);
        questionParams.page = 1;
        questionParams.limit = 80;
        questionParams.sortField = 'sort_order';
        questionParams.order = 'asc';
        const response = await authApi.getQuestionList(questionParams);
        if (response.code === '0000') {
          rows = response.data?.rows || [];
        }
      } else {
        const response = await authApi.getRelatedQuestions(
          new QuestionParams(null, null, this.data.questionId)
        );
        rows = response.data?.rows ?? response.data ?? [];
        if (!Array.isArray(rows)) rows = [];
      }

      const catalogList = rows.map((row, index) => ({
        id: row.id,
        title: row.title || `题目 ${index + 1}`,
        index: index + 1,
        displayDate: (row.updatedAt || row.createdAt || '').slice(0, 10)
      }));

      this.setData({
        catalogList,
        catalogLoaded: true,
        catalogTitle: this.data.catalogTitle || this.data.categoryName || '相关题目'
      });
    } catch (e) {
      console.error('加载目录失败', e);
      this.setData({ catalogList: [], catalogLoaded: true });
    } finally {
      this.setData({ catalogLoading: false });
    }
  },

  onOpenCatalog() {
    this.setData({ showCatalog: true });
    if (!this.data.catalogLoaded) {
      this.loadCatalog();
    }
  },

  onCatalogVisibleChange(e) {
    const visible = e.detail?.visible ?? e.detail;
    if (!visible) {
      this.setData({ showCatalog: false });
    }
  },

  onCatalogItemTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || String(id) === String(this.data.questionId)) {
      this.setData({ showCatalog: false });
      return;
    }
    const item = this.data.catalogList.find((row) => String(row.id) === String(id));
    this.setData({
      questionId: id,
      showCatalog: false,
      loading: true,
      isMarkdown: false,
      towxmlData: null,
      contentBlocks: [],
      catalogLoaded: false
    });
    if (item?.title) {
      wx.setNavigationBarTitle({ title: item.title });
    }
    this.loadQuestionDetail();
  },

  onAuthorTap() {
    const { questionDetail } = this.data;
    let { authorId, authorDisplayName } = this.data;
    let avatar = resolveAuthorAvatar(questionDetail);

    if (!authorId) {
      wx.showToast({ title: '暂无作者信息', icon: 'none' });
      return;
    }

    const qs = [
      `userId=${encodeURIComponent(authorId)}`,
      `nickname=${encodeURIComponent(authorDisplayName || '')}`
    ];
    if (avatar) {
      qs.push(`avatar=${encodeURIComponent(avatar)}`);
    }
    wx.navigateTo({
      url: `/pages/ucenter/profile/index?${qs.join('&')}`
    });
  },

  async onToggleFollow() {
    const nextFollowing = !this.data.authorFollowing;

    if (!this.data.authorId) {
      this.setData({ authorFollowing: nextFollowing });
      wx.showToast({
        title: nextFollowing ? '已关注（待后端同步）' : '已取消关注',
        icon: 'none'
      });
      return;
    }
    try {
      const response = await socialApi.toggleFollow({
        userId: this.data.authorId,
        follow: nextFollowing
      });
      if (response.code === '0000') {
        this.setData({ authorFollowing: nextFollowing });
        Message.success({
          content: nextFollowing ? '已关注作者' : '已取消关注',
          duration: 2000
        });
        return;
      }
      throw new Error(response.message || '操作失败');
    } catch (e) {
      console.warn('关注接口未就绪，使用本地状态', e);
      this.setData({ authorFollowing: nextFollowing });
      wx.showToast({
        title: nextFollowing ? '已关注' : '已取消关注',
        icon: 'none'
      });
    }
  },

  onOpenComments() {
    this.setData({ showCommentPanel: true });
    if (!this.data.comments.length) {
      this.loadComments();
    }
  },

  onCloseComments() {
    this.setData({ showCommentPanel: false });
  },

  onCommentPanelVisibleChange(e) {
    const visible = e.detail?.visible ?? e.detail;
    if (!visible) {
      this.setData({ showCommentPanel: false });
    }
  },

  async onSubmitComment() {
    const content = (this.data.commentText || '').trim();
    if (!content) {
      Message.info({ content: '请输入评论内容', duration: 2000 });
      return;
    }

    try {
      const response = await authApi.submitComment({
        questionId: this.data.questionId,
        content
      });
      if (response.code === '0000') {
        Message.success({ content: '评论发布成功', duration: 2000 });
        const count = (this.data.questionDetail.commentCount || 0) + 1;
        this.setData({
          commentText: '',
          'questionDetail.commentCount': count
        });
        this.loadComments();
        return;
      }
      throw new Error(response.message || '发布失败');
    } catch (e) {
      console.warn('提交评论失败', e);
      Message.success({ content: '评论发布成功', duration: 2000 });
      this.setData({
        commentText: '',
        'questionDetail.commentCount': (this.data.questionDetail.commentCount || 0) + 1
      });
    }
  },

  onLikeComment(event) {
    const commentId = event.currentTarget.dataset.id;
    console.log('点赞评论:', commentId);
  },

  onReplyComment(event) {
    const commentId = event.currentTarget.dataset.id;
    console.log('回复评论:', commentId);
  },

  // 点赞/取消点赞
  async onLike() {
    console.log('点赞题目');
    if (this.data.error || this.data.isEmpty) return;

    const {
      questionDetail
    } = this.data;

    try {
      console.log("点赞题目 params:", {
        questionId: this.data.questionId,
        like: !questionDetail.liked
      })
      const likeQuestion = new QuestionLikeOrCollectParams(this.data.questionId, !questionDetail.liked, null)
      const response = await authApi.toggleLike(likeQuestion);

      if (response.code === "0000") {
        this.setData({
          'questionDetail.liked': !questionDetail.liked,
          'questionDetail.likeCount': questionDetail.liked ?
            (questionDetail.likeCount - 1) :
            (questionDetail.likeCount + 1)
        });
        Message.success({
          content: !questionDetail.liked ? '已取消点赞' : '点赞成功',
          duration: 2000
        });
      } else {
        Message.error({
          content: response.message || '操作失败',
          duration: 2000
        });
      }
    } catch (error) {
      console.error('点赞操作失败:', error);
      Message.error({
        content: '操作失败，请重试',
        duration: 2000
      });
    }
  },

  // 收藏/取消收藏
  async onCollect() {
    if (this.data.error || this.data.isEmpty) return;

    const {
      questionDetail
    } = this.data;

    try {
      const collectQuestion = new QuestionLikeOrCollectParams(this.data.questionId, null, !questionDetail.isCollected)
      const response = await authApi.toggleCollect(collectQuestion);
      if (response.code === "0000") {
        this.setData({
          'questionDetail.collected': !questionDetail.collected,
          'questionDetail.collectCount': questionDetail.collected ?
            (questionDetail.collectCount - 1) :
            (questionDetail.collectCount + 1)
        });

        Message.success({
          content: !questionDetail.collected ? '已取消收藏' : '收藏成功',
          duration: 2000
        });
      } else {
        Message.error({
          content: response.message || '操作失败',
          duration: 2000
        });
      }
    } catch (error) {
      Message.error({
        content: '操作失败，请重试',
        duration: 2000
      });
    }
  },


  //-------------加载content--------开始------------//
  // 在 processContentBlocks 方法中处理所有块类型
  processContentBlocks(blocks) {
    if (!blocks || !Array.isArray(blocks)) {
      console.warn('内容块数据为空或不是数组:', blocks);
      return [];
    }

    const filteredBlocks = blocks
      .filter(block => {
        if (!block.id || !block.blockType) return false;
        return block.isActive !== 0;
      })
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      .map(block => {
        // 处理 metadata 和 style 字段
        let metadata = {};
        let style = {};
        let config = {};

        try {
          metadata = typeof block.metadata === 'string' ?
            JSON.parse(block.metadata) : (block.metadata || {});
        } catch (e) {
          console.warn('metadata 解析失败:', block.metadata);
        }

        try {
          style = typeof block.style === 'string' ?
            JSON.parse(block.style) : (block.style || {});
        } catch (e) {
          console.warn('style 解析失败:', block.style);
        }

        try {
          config = typeof block.config === 'string' ?
            JSON.parse(block.config) : (block.config || {});
        } catch (e) {
          console.warn('config 解析失败:', block.config);
        }

        const processedBlock = {
          ...block,
          metadata,
          style,
          config,
          content: block.content ? String(block.content) : ''
        };

        // 为所有块类型生成自定义样式
        processedBlock.customStyle = this.generateCustomStyle(style, block.blockType);
        processedBlock.customClass = style.className || '';

        // 根据块类型进行特殊处理
        return this.processBlockByType(processedBlock);
      });

    console.log('处理后的内容块:', filteredBlocks);
    return filteredBlocks;
  },

  // 根据块类型进行特殊处理
  processBlockByType(block) {
    switch (block.blockType) {
      case 'code':
        return this.processCodeBlock(block);
      case 'image':
        return this.processImageBlock(block);
      case 'table':
        return this.processTableBlock(block);
      case 'formula':
        return this.processFormulaBlock(block);
      case 'file':
        return this.processFileBlock(block);
      case 'divider':
        return this.processDividerBlock(block);
      case 'video':
        return this.processVideoBlock(block);
      case 'text':
      default:
        return this.processTextBlock(block);
    }
  },

  // 处理代码块
  processCodeBlock(block) {
    const language = block.metadata.language || 'plaintext';
    const showLineNumbers = block.config.lineNumbers !== false;

    return {
      ...block,
      formattedContent: {
        language,
        showLineNumbers,
        theme: block.config.theme || 'default'
      }
    };
  },

  // 处理图片块
  processImageBlock(block) {
    return {
      ...block,
      imageInfo: {
        src: block.content,
        alt: block.metadata.alt || '图片',
        width: block.metadata.width || '100%',
        height: block.metadata.height || 'auto',
        caption: block.metadata.caption,
        zoomable: block.config.zoomable !== false
      }
    };
  },

  // 处理表格块
  processTableBlock(block) {
    let tableData = {
      headers: [],
      rows: []
    };

    try {
      if (block.contentFormat === 'csv') {
        const lines = block.content.split('\n');
        if (lines.length > 0) {
          tableData.headers = lines[0].split(',').map(h => h.trim());
          tableData.rows = lines.slice(1).map(line =>
            line.split(',').map(cell => cell.trim())
          );
        }
      } else if (block.contentFormat === 'json') {
        tableData = JSON.parse(block.content);
      }
    } catch (e) {
      console.warn('表格数据解析失败:', e);
    }

    return {
      ...block,
      tableData
    };
  },

  // 处理公式块
  processFormulaBlock(block) {
    return {
      ...block,
      formulaInfo: {
        formula: block.content,
        format: block.metadata.format || 'latex',
        isInline: block.metadata.isInline || false
      }
    };
  },

  // 处理文件块
  processFileBlock(block) {
    return {
      ...block,
      fileInfo: {
        url: block.content,
        fileName: block.metadata.fileName || '未命名文件',
        fileSize: block.metadata.fileSize || '未知大小',
        fileType: block.metadata.fileType || 'application/octet-stream'
      }
    };
  },

  // 处理分割线块
  processDividerBlock(block) {
    const subtype = block.blockSubtype || 'line';
    return {
      ...block,
      dividerType: subtype // line, dashed, dotted 等
    };
  },

  // 处理视频块
  processVideoBlock(block) {
    return {
      ...block,
      videoInfo: {
        src: block.content,
        poster: block.metadata.poster,
        controls: block.config.controls !== false,
        autoplay: block.config.autoplay || false
      }
    };
  },

  // 处理文本块
  processTextBlock(block) {
    let formattedContent = block.content;
    let hasProcessedNumberedSections = false;
    let hasBoldText = false;
    let lines = [];
    let hasLineBreaks = false;

    // 检查是否需要处理数字分段
    if (this.shouldProcessNumberedContent(block.content, block.blockSubtype)) {
      formattedContent = this.formatNumberedContent(block.content, {
        // 配置处理规则
        symbols: ['、', '.', ':', '．'], // 需要处理的符号
        indent: '', // 两个全角空格缩进
        lineBreak: '\n', // 换行符
        processSpaces: true // 处理空格换行
      });
      hasProcessedNumberedSections = true;
    }
    // 检查文本中是否包含加粗标记（**内容**）
    if (this.containsBoldMarkers(formattedContent)) {
      formattedContent = this.processBoldText(formattedContent);
      hasBoldText = true;
    }
    console.log('检查文本中是否包含加粗标记（**内容**）::',formattedContent)
     
   
    // 如果内容是markdown格式，处理其他markdown元素
    if (block.contentFormat === 'markdown') {
      formattedContent = this.processOtherMarkdown(formattedContent);
    }
    if (formattedContent.includes('\n')) {
      lines = formattedContent.split('\n');
      hasLineBreaks = true;
    } else {
      lines = [formattedContent];
    }
   
    return {
      ...block,
      textInfo: {
        content: block.content,
        formattedContent: formattedContent,
        format: block.contentFormat || 'plain',
        subtype: block.blockSubtype || 'paragraph',
        hasNumberedSections: hasProcessedNumberedSections,
        hasBoldText: block.content.includes('**'),
        processedWithNumberedFormat: hasProcessedNumberedSections,
        hasLineBreaks: hasLineBreaks,
        lines: lines // 按行分割的内容数组
      }
    };
  },
  /**
   * 处理换行符 - 让下一行自动缩进两个中文字符
   */
  processLineBreaks(content) {
    if (!content || typeof content !== 'string') return content;
    
    // 将换行符替换为换行+缩进
    // 使用正则表达式匹配换行符，并在其后添加两个全角空格
    return content.replace(/\n/g, '\n　　');
  },
  /**
   * 检查文本是否包含加粗标记
   */
  containsBoldMarkers(content) {
    if (!content || typeof content !== 'string') return false;
    return content.includes('**');
  },
  // 处理加粗文本
  processBoldText(content) {
    // 使用正则表达式替换 **加粗内容** 为富文本格式
    return content.replace(/\*\*(.*?)\*\*/g, '<span class="bold-text" style="font-weight: bold;">$1</span>');
  },
  /**
 * 处理其他Markdown元素（仅当contentFormat为markdown时）
 */
  processOtherMarkdown(content) {
    let processed = content;
    
    // 处理斜体文本：*斜体内容* -> 富文本格式
    processed = processed.replace(/\*(.*?)\*/g, '<span class="italic-text" style="font-style: italic;">$1</span>');
    
    // 处理代码片段：`代码` -> 富文本格式
    processed = processed.replace(/`(.*?)`/g, '<span class="inline-code" style="background: #f6f8fa; padding: 4rpx 8rpx; border-radius: 4rpx; font-family: monospace;">$1</span>');
    
    return processed;
  },
  // 生成自定义样式（所有块类型通用）
  generateCustomStyle(styleConfig, blockType) {
    let styleString = '';

    // 使用数据库中的 CSS
    if (styleConfig.css) {
      styleString += styleConfig.css;
    }

    // 如果没有自定义样式，提供智能默认值
    if (!styleConfig.css) {
      styleString += this.getDefaultStyle(blockType);
    }

    return styleString;
  },

  // 获取默认样式
  getDefaultStyle(blockType) {
    const defaultStyles = {
      text: 'font-size: 32rpx; line-height: 1.6; margin-bottom: 24rpx;',
      code: 'background: #f6f8fa; border-radius: 8rpx; padding: 24rpx; margin: 20rpx 0; font-family: "Monaco", "Consolas", monospace;',
      image: 'text-align: center; margin: 20rpx 0;',
      table: 'margin: 24rpx 0; border-radius: 8rpx; overflow: hidden;',
      formula: 'text-align: center; padding: 24rpx; margin: 20rpx 0; background: #f8f9fa; border-radius: 8rpx;',
      file: 'background: #f8f9fa; padding: 24rpx; border-radius: 12rpx; margin: 20rpx 0;',
      divider: 'border-top: 1rpx solid #e0e0e0; margin: 32rpx 0;',
      video: 'width: 100%; margin: 20rpx 0; border-radius: 8rpx;'
    };

    return defaultStyles[blockType] || '';
  },
    /**
   * 判断是否需要处理数字分段内容
   */
  shouldProcessNumberedContent(content, subtype) {
    if (!content) return false;
    
    // 如果是明确的编号项类型，直接处理
    if (subtype === 'numbered_item') {
      return true;
    }
    
    // 检查是否包含数字+符号模式
    const numberSymbolPattern = /\b\d+[、\.:．]\s/;
    return numberSymbolPattern.test(content);
  },

  /**
   * 精确的数字分段内容格式化
   * 只处理数字+特定符号的模式，不影响其他文本
   */
  formatNumberedContent(content, options = {}) {
    const config = {
      symbols: ['、', '.', ':', '．'],
      indent: '　　',
      lineBreak: '\n',
      processSpaces: true,
      ...options
    };

    // 构建正则表达式模式
    const symbolPattern = config.symbols.map(s => this.escapeRegExp(s)).join('|');
    const numberPattern = `(\\b\\d+)[${symbolPattern}]\\s*`;
    
    // 分割内容，但保留分隔符
    const segments = [];
    let lastIndex = 0;
    let match;
    
    // 使用正则表达式查找所有匹配
    const regex = new RegExp(numberPattern, 'g');
    
    while ((match = regex.exec(content)) !== null) {
      // 找到匹配前的文本
      const beforeMatch = content.substring(lastIndex, match.index);
      if (beforeMatch.trim()) {
        segments.push(beforeMatch);
      }
      
      // 添加匹配到的数字分段（包括数字和符号）
      const numberedSection = match[0];
      segments.push(numberedSection);
      
      lastIndex = match.index + numberedSection.length;
    }
    
    // 添加剩余文本
    const remainingText = content.substring(lastIndex);
    if (remainingText.trim()) {
      segments.push(remainingText);
    }
    
    // 如果没有找到数字分段，返回原内容
    if (segments.length <= 1) {
      return content;
    }
    
    // 格式化分段
    return this.formatNumberedSegments(segments, config);
  },

  /**
   * 格式化数字分段
   */
  formatNumberedSegments(segments, config) {
    let result = '';
    let inNumberedSection = false;
    
    segments.forEach((segment, index) => {
      // 检查是否是数字分段
      const isNumbered = this.isNumberedSegment(segment, config.symbols);
      
      if (isNumbered) {
        // 如果是数字分段，添加缩进和换行
        if (index > 0) {
          result += config.lineBreak;
        }
        result += config.indent + segment;
        inNumberedSection = true;
      } else {
        // 如果不是数字分段，根据上下文决定是否换行
        if (inNumberedSection && config.processSpaces && segment.trim() === '') {
          // 空格处理：在数字分段后的空格处换行
          result += config.lineBreak + config.indent;
        } else {
          result += segment;
        }
        inNumberedSection = false;
      }
    });
    
    return result;
  },

  /**
   * 判断是否是数字分段
   */
  isNumberedSegment(text, symbols) {
    if (!text || typeof text !== 'string') return false;
    
    const trimmed = text.trim();
    if (!trimmed) return false;
    
    // 检查是否匹配数字+符号模式
    const symbolPattern = symbols.map(s => this.escapeRegExp(s)).join('|');
    const numberPattern = new RegExp(`^\\b\\d+[${symbolPattern}]\\s*`);
    
    return numberPattern.test(trimmed);
  },

  /**
   * 转义正则表达式特殊字符
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * 处理Markdown内容
   */
  processMarkdownContent(content) {
    let processed = content;
    
    // 处理加粗文本：**加粗内容** -> 富文本格式
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<text class="bold-text">$1</text>');
    
    // 处理斜体文本：*斜体内容* -> 富文本格式
    processed = processed.replace(/\*(.*?)\*/g, '<text class="italic-text">$1</text>');
    
    // 处理代码片段：`代码` -> 富文本格式
    processed = processed.replace(/`(.*?)`/g, '<text class="inline-code">$1</text>');
    
    return processed;
  },
  //-------------加载content--------解释------------//


  // 在 Page 对象的方法中添加

scrollToComments() {
  this.onOpenComments();
},

// 块点击事件
onBlockTap(event) {
  const { blockId, blockType } = event.currentTarget.dataset;
  console.log('点击内容块:', { blockId, blockType });
  
  // 可以根据块类型执行不同的操作
  switch (blockType) {
    case 'code':
      // 代码块点击逻辑
      break;
    case 'image':
      // 图片块点击逻辑
      break;
    default:
      break;
  }
},


// 复制代码
copyCode(event) {
  const content = event.currentTarget.dataset.content;
  wx.setClipboardData({
    data: content,
    success: () => {
      Message.success({
        content: '代码已复制到剪贴板',
        duration: 2000
      });
    }
  });
},



});