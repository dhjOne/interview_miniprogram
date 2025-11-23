// pages/question/detail/index.js
import Message from 'tdesign-miniprogram/message/index';
import { authApi } from '~/api/request/api_question';
import { QuestionParams } from '~/api/param/param_question';

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
    shareOptions: [
      { label: '复制', icon: 'queue', value: 'copy' },
      { label: '朋友圈', image: 'https://tdesign.gtimg.com/mobile/demos/times.png', value: 'moment' },
      { label: '刷新', icon: 'refresh', value: 'refresh' },
      { label: '微信', image: 'https://tdesign.gtimg.com/mobile/demos/wechat.png', value: 'wechat' }
    ],
    showGuide: false,
    guideSteps: [
      {
        id: 'step1',
        element: '.share-action', // 直接使用字符串，让组件内部处理
        content: '点击右上角"···"按钮，选择"转发"分享给好友'
      }
    ]
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
    
    
 
});
