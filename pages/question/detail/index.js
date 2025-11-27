// pages/question/detail/index.js
import Message from 'tdesign-miniprogram/message/index';
import { authApi } from '~/api/request/api_question';
import { QuestionLikeOrCollectParams, QuestionParams } from '~/api/param/param_question';

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
    
    // 新增状态字段
    loading: true,      // 加载中
    error: false,       // 错误状态
    errorMessage: '',   // 错误信息
    isEmpty: false,     // 空数据状态
    
    // 分享相关状态
    showShareActionSheet: false, // 分享操作面板
    showCustomGuide: false,      // 使用自定义引导弹窗
    
    shareOptions: [
      { 
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
    blockStyles: {},   // 块样式配置
    currentTheme: 'default' // 当前主题
    
  },

  onLoad(options) {
    console.log('题目详情页面加载', options);
    const { id } = options;
    if (!id) {
      this.setData({
        loading: false,
        error: true,
        errorMessage: '题目ID不能为空'
      });
      return;
    }
    const { title } = options;
    wx.setNavigationBarTitle({
      title: title || '题目详情'
    });
    
    this.setData({ questionId: id });
    this.loadQuestionDetail();
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 加载题目详情
  async loadQuestionDetail() {
    try {
      this.setData({ loading: true });
      const questionDetail = new QuestionParams(null, null, this.data.questionId)
      const response = await authApi.getQuestionDetail(questionDetail);
      if (response.data) {
        const questionDetail = response.data;
        const contentBlocks = questionDetail.contentList || [];
        console.log('contentBlocks::::',contentBlocks)
        this.setData({
          questionDetail,
          loading: false,
          error: false,
          isEmpty: false,
          contentBlocks: this.processContentBlocks(contentBlocks),
        });
        // 检查最终设置的数据
       console.log('设置后的 contentBlocks:', this.data.contentBlocks);
        // 应用样式
        // this.applyBlockStyles();
        // 设置页面标题
        wx.setNavigationBarTitle({
          title: this.data.title || '题目详情'
        });

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

  // 点击分享按钮
  onShare() {
    this.setData({
      showShareActionSheet: true
    });
  },

  // 分享选项选择
  onShareOptionSelect(event) {
    const { selected } = event.detail;
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
      isEmpty: false
    });
    this.loadQuestionDetail();
  },

  // 重新加载
  retryLoad() {
    this.setData({
      loading: true,
      error: false,
      errorMessage: '',
      isEmpty: false
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

  onSubmitComment() {
    Message.success({
      content: '评论发布成功',
      duration: 2000
    });
    this.setData({
      commentText: ''
    });
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
    
    const { questionDetail } = this.data;
    
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
          'questionDetail.likeCount': questionDetail.liked 
            ? (questionDetail.likeCount - 1) 
            : (questionDetail.likeCount + 1)
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
    
    const { questionDetail } = this.data;
    
    try {
      const collectQuestion = new QuestionLikeOrCollectParams(this.data.questionId, null, !questionDetail.isCollected)
      const response = await authApi.toggleCollect(collectQuestion);
      if (response.code === "0000") {
        this.setData({
          'questionDetail.collected': !questionDetail.collected,
          'questionDetail.collectCount': questionDetail.collected 
            ? (questionDetail.collectCount - 1) 
            : (questionDetail.collectCount + 1)
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
  let tableData = { headers: [], rows: [] };
  
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
  return {
    ...block,
    textInfo: {
      content: block.content,
      format: block.contentFormat || 'plain',
      subtype: block.blockSubtype || 'paragraph'
    }
  };
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
}
  //-------------加载content--------解释------------//




});