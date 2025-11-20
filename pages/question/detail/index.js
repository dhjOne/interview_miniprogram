// pages/question/detail/index.js
import Message from 'tdesign-miniprogram/message/index';
import { authApi } from '~/api/request/api_question';
import { QuestionParams } from '~/api/param/param_question';
import ActionSheet, { ActionSheetTheme } from 'tdesign-miniprogram/action-sheet/index';

// 引入 towxml
// import Towxml from '../../../../towxml/towxml';

Page({
  data: {
    questionId: null,
    questionDetail: {},
    relatedQuestions: [],
    comments: [],
    commentCount: 0,
    commentText: '',
    showActionBar: true,
    showSharePopup: false,
    scrollTop: 0,
    
    // 新增状态字段
    loading: true,      // 加载中
    error: false,       // 错误状态
    errorMessage: '',   // 错误信息
    isEmpty: false,      // 空数据状态
    shareOptions: firstGrid
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

    this.setData({ questionId: id });
    // 确保方法绑定正确
    this.getDifficultyTheme = this.getDifficultyTheme.bind(this);
    this.getDifficultyText = this.getDifficultyText.bind(this);
    // 初始化 towxml 实例
    // this.towxml = new Towxml();
    
    this.loadQuestionDetail();
    // this.loadRelatedQuestions();
    // this.loadComments();
  },

  onShow() {
    // 页面显示时刷新收藏状态
    if (this.data.questionId && !this.data.loading && !this.data.error && !this.data.isEmpty) {
      this.refreshQuestionStatus();
    }
  },

  onPageScroll(e) {
    // 控制底部操作栏显示/隐藏
    const { scrollTop } = e;
    
    // 添加空值检查，确保 scrollTop 是有效数字
    const validScrollTop = scrollTop || 0;
    const showActionBar = validScrollTop <= 100 || validScrollTop < (this.data.scrollTop || 0);
    
    this.setData({
      showActionBar,
      scrollTop: validScrollTop
    });
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

  // 加载题目详情
  async loadQuestionDetail() {
    try {
      this.setData({ loading: true });
 
      const questionDetail = new QuestionParams(null, null, this.data.questionId)
      const response = await authApi.getQuestionDetail(questionDetail);
      
      if (response.code === "0000") {
        if (response.data) {
          const questionDetail = response.data;
        
          // 直接在这里预处理难度信息
          if (questionDetail.difficulty) {
            questionDetail.difficultyTheme = this.getDifficultyTheme(questionDetail.difficulty);
            questionDetail.difficultyText = this.getDifficultyText(questionDetail.difficulty);
          }
          this.setData({
            questionDetail,
  
            loading: false,
            error: false,
            isEmpty: false
          });

          // 设置页面标题
          wx.setNavigationBarTitle({
            title: '题目详情'
          });

          // 增加浏览量
          this.incrementViewCount();
        } else {
          // 数据为空
          this.setData({
            loading: false,
            error: false,
            isEmpty: true
          });
        }
      } else {
        // 接口返回错误
        this.setData({
          loading: false,
          error: true,
          errorMessage: response.message || '加载失败'
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

  // 加载相关题目
  async loadRelatedQuestions() {
    if (this.data.error || this.data.isEmpty) return;
    
    try {
      const response = await authApi.getRelatedQuestions({
        questionId: this.data.questionId,
        limit: 5
      });

      if (response.code === "0000") {
        this.setData({
          relatedQuestions: response.data || []
        });
      }
    } catch (error) {
      console.error('加载相关题目失败:', error);
    }
  },

  // 加载评论
  async loadComments() {
    if (this.data.error || this.data.isEmpty) return;
    
    try {
      const response = await authApi.getQuestionComments({
        questionId: this.data.questionId,
        page: 1,
        pageSize: 10
      });

      if (response.code === "0000") {
        this.setData({
          comments: response.data.rows || [],
          commentCount: response.data.total || 0
        });
      }
    } catch (error) {
      console.error('加载评论失败:', error);
    }
  },

  // 增加浏览量
  async incrementViewCount() {
    try {
      await authApi.incrementViewCount(this.data.questionId);
    } catch (error) {
      console.error('增加浏览量失败:', error);
    }
  },

  // 刷新题目状态（收藏、点赞等）
  async refreshQuestionStatus() {
    try {
      const response = await authApi.getQuestionStatus(this.data.questionId);
      
      if (response.code === "0000") {
        this.setData({
          'questionDetail.isLiked': response.data.isLiked,
          'questionDetail.isCollected': response.data.isCollected,
          'questionDetail.likeCount': response.data.likeCount,
          'questionDetail.collectCount': response.data.collectCount
        });
      }
    } catch (error) {
      console.error('刷新题目状态失败:', error);
    }
  },

  // 点赞/取消点赞
  async onLike() {
    if (this.data.error || this.data.isEmpty) return;
    
    const { questionDetail } = this.data;
    
    try {
      const response = await authApi.toggleLike({
        questionId: this.data.questionId,
        like: !questionDetail.isLiked
      });

      if (response.code === "0000") {
        this.setData({
          'questionDetail.isLiked': !questionDetail.isLiked,
          'questionDetail.likeCount': questionDetail.isLiked 
            ? (questionDetail.likeCount - 1) 
            : (questionDetail.likeCount + 1)
        });

        Message.success(questionDetail.isLiked ? '已取消点赞' : '点赞成功');
      } else {
        Message.error(response.message || '操作失败');
      }
    } catch (error) {
      console.error('点赞操作失败:', error);
      Message.error('操作失败，请重试');
    }
  },

  // 收藏/取消收藏
  async onCollect() {
    if (this.data.error || this.data.isEmpty) return;
    
    const { questionDetail } = this.data;
    
    try {
      const response = await authApi.toggleCollect({
        questionId: this.data.questionId,
        collect: !questionDetail.isCollected
      });

      if (response.code === "0000") {
        this.setData({
          'questionDetail.isCollected': !questionDetail.isCollected,
          'questionDetail.collectCount': questionDetail.isCollected 
            ? (questionDetail.collectCount - 1) 
            : (questionDetail.collectCount + 1)
        });

        Message.success(questionDetail.isCollected ? '已取消收藏' : '收藏成功');
      } else {
        Message.error(response.message || '操作失败');
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
      Message.error('操作失败，请重试');
    }
  },

  // 分享
  onShare() {
    if (this.data.error || this.data.isEmpty) return;
    this.setData({ showSharePopup: true });
    ActionSheet.show({
      theme: ActionSheetTheme.Grid,
      selector: '#t-action-sheet',
      context: this,
      items: firstGrid,
    });
  },

  // 分享选项选择事件
  onShareSelect(event) {
    const { value } = event.detail;
    switch (value) {
      case 'wechat':
        this.onShareToWechat();
        break;
      case 'moment':
        this.onShareToMoment();
        break;
      case 'link':
        this.onCopyLink();
        break;
      case 'image':
        this.onGenerateImage();
        break;
      case 'more':
        this.onMoreShare();
        break;
    }
    this.setData({
      showSharePopup: false
    });
  },

  // 取消分享
  onCancelShare() {
    this.setData({
      showSharePopup: false
    });
  },

  // 生成分享图片
  onGenerateImage() {
    // 实现生成图片的逻辑
    wx.showToast({
      title: '生成分享图片',
      icon: 'none'
    });
  },

  // 更多分享
  onMoreShare() {
    wx.showActionSheet({
      itemList: ['QQ', '微博', '钉钉', '其他应用'],
      success: (res) => {
        const methods = ['onShareToQQ', 'onShareToWeibo', 'onShareToDingTalk', 'onShareToOther'];
        if (methods[res.tapIndex]) {
          this[methods[res.tapIndex]]();
        }
      }
    });
  },

  // 其他分享方法
  onShareToQQ() {
    wx.showToast({
      title: '分享到QQ',
      icon: 'none'
    });
  },

  onShareToWeibo() {
    wx.showToast({
      title: '分享到微博',
      icon: 'none'
    });
  },

  onShareToDingTalk() {
    wx.showToast({
      title: '分享到钉钉',
      icon: 'none'
    });
  },

  onShareToOther() {
    wx.showToast({
      title: '分享到其他应用',
      icon: 'none'
    });
  },

  onSharePopupChange(e) {
    this.setData({ showSharePopup: e.detail.visible });
  },


  onShareToWechat() {
    if (this.data.error || this.data.isEmpty) return;
    // 微信分享逻辑
    wx.shareAppMessage({
      title: this.data.questionDetail.title,
      path: `/pages/question/detail/index?id=${this.data.questionId}`,
      imageUrl: '' // 可以设置分享图片
    });
    this.setData({ showSharePopup: false });
  },

  onShareToMoment() {
    if (this.data.error || this.data.isEmpty) return;
    // 分享到朋友圈
    wx.updateShareMenu({
      withShareTicket: true,
      isShareTimeline: true
    });
    this.setData({ showSharePopup: false });
  },

  onCopyLink() {
    if (this.data.error || this.data.isEmpty) return;
    // 复制链接
    wx.setClipboardData({
      data: `https://your-domain.com/pages/question/detail/index?id=${this.data.questionId}`,
      success: () => {
        Message.success('链接已复制');
        this.setData({ showSharePopup: false });
      }
    });
  },

  // 复制代码
  onCopyCode() {
    if (this.data.error || this.data.isEmpty) return;
    
    const { questionDetail } = this.data;
    if (questionDetail.code) {
      wx.setClipboardData({
        data: questionDetail.code,
        success: () => {
          Message.success('代码已复制');
        }
      });
    }
  },

  // 尝试解答
  onTryAnswer() {
    if (this.data.error || this.data.isEmpty) return;
    
    // 跳转到答题页面或显示答题弹窗
    wx.navigateTo({
      url: `/pages/answer/index?questionId=${this.data.questionId}`
    });
  },

  // 评论相关
  onCommentChange(e) {
    this.setData({ commentText: e.detail.value });
  },

  async onSubmitComment() {
    if (this.data.error || this.data.isEmpty) return;
    
    const { commentText } = this.data;
    
    if (!commentText.trim()) {
      Message.error('请输入评论内容');
      return;
    }

    try {
      const response = await authApi.submitComment({
        questionId: this.data.questionId,
        content: commentText.trim()
      });

      if (response.code === "0000") {
        Message.success('评论发布成功');
        this.setData({ commentText: '' });
        this.loadComments(); // 重新加载评论
      } else {
        Message.error(response.message || '发布失败');
      }
    } catch (error) {
      console.error('发布评论失败:', error);
      Message.error('发布失败，请重试');
    }
  },

  onLikeComment(e) {
    if (this.data.error || this.data.isEmpty) return;
    
    const commentId = e.currentTarget.dataset.id;
    // 点赞评论逻辑
    console.log('点赞评论:', commentId);
  },

  onReplyComment(e) {
    if (this.data.error || this.data.isEmpty) return;
    
    const commentId = e.currentTarget.dataset.id;
    // 回复评论逻辑
    console.log('回复评论:', commentId);
  },

  // 相关题目点击
  onRelatedQuestionClick(e) {
    const questionId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/question/detail/index?id=${questionId}`
    });
  },

  viewAllRelated() {
    wx.navigateTo({
      url: `/pages/question/list/index?relatedTo=${this.data.questionId}`
    });
  },

  // 获取难度主题色
  getDifficultyTheme(difficulty) {
    console.log('获取难度文本')
    const themes = {
      1: 'success',
      2: 'warning',
      3: 'danger'
    };
    return themes[difficulty] || 'outline';
  },

  // 获取难度文本
  getDifficultyText(difficulty) {
    console.log('获取难度文本')
    const texts = {
      1: '简单',
      2: '中等',
      3: '困难'
    };
    return texts[difficulty] || '未知';
  },

  // 页面分享配置
  onShareAppMessage() {
    if (this.data.error || this.data.isEmpty) {
      return {
        title: '题目详情',
        path: '/pages/question/list/index'
      };
    }
    
    return {
      title: this.data.questionDetail.title,
      path: `/pages/question/detail/index?id=${this.data.questionId}`,
      imageUrl: '' // 分享图片
    };
  }
});

const firstGrid = [
  {
    label: '微信',
    image: 'https://tdesign.gtimg.com/mobile/demos/wechat.png',
  },
  {
    label: '朋友圈',
    image: 'https://tdesign.gtimg.com/mobile/demos/times.png',
  },
  {
    label: 'QQ',
    image: 'https://tdesign.gtimg.com/mobile/demos/qq.png',
  },
  {
    label: '企业微信',
    image: 'https://tdesign.gtimg.com/mobile/demos/wecom.png',
  },
  {
    label: '收藏',
    icon: 'star',
  },
  {
    label: '刷新',
    icon: 'refresh',
  },
  {
    label: '下载',
    icon: 'download',
  },
  {
    label: '复制',
    icon: 'queue',
  },
];

Component({
  methods: {
    handleAction() {
      ActionSheet.show({
        theme: ActionSheetTheme.Grid,
        selector: '#t-action-sheet',
        context: this,
        items: firstGrid,
      });
    },
    handleMultiAction() {
      ActionSheet.show({
        theme: ActionSheetTheme.Grid,
        selector: '#t-action-sheet',
        context: this,
        items: firstGrid.concat(
          new Array(8).fill({
            label: '标题文字',
            icon: 'image',
          }),
        ),
      });
    },
    handleSelected(e) {
      console.log(e.detail);
    },
  },
});