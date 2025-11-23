// pages/question/list/index.js
import Message from 'tdesign-miniprogram/message/index';
import { authApi } from '~/api/request/api_question';
import { QuestionParams } from '~/api/param/param_question';

Page({
  data: {
    searchValue: '',
    activeFilter: 'all',
    sortType: 'default',
    questionList: [],
    totalCount: 0,
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    showBackTop: false,
    categoryId: null, // 新增：分类ID
    categoryName: '', // 新增：分类名称
    
    filterTags: [
      { label: '全部', value: 'all' },
      { label: '已收藏', value: 'collected' },
      { label: '未收藏', value: 'uncollected' },
      { label: '简单', value: 'easy' },
      { label: '中等', value: 'medium' },
      { label: '困难', value: 'hard' }
    ]
  },

  onLoad(options) {
    console.log('题库列表页面加载', options);
    
    const { categoryId, categoryName, secondaryCategoryId, secondaryCategoryName } = options;
    
    const finalCategoryId = categoryId || secondaryCategoryId;
    const finalCategoryName = categoryName || secondaryCategoryName;
    
    this.setData({
      categoryId: finalCategoryId,
      categoryName: finalCategoryName
    });
    
    // 动态设置导航栏标题
    wx.setNavigationBarTitle({
      title: finalCategoryName || '题库列表'
    });
    
    this.loadQuestions(true);
  },
  
  onReady() {
    // 组件渲染完成后再次确保标题正确
    if (this.data.categoryName) {
      wx.setNavigationBarTitle({
        title: this.data.categoryName
      });
    }
  },
  onShow() {
    // 页面显示时刷新收藏状态
    this.refreshCollectStatus();
  },

  onPageScroll(e) {
    // 显示回到顶部按钮
    this.setData({
      showBackTop: e.scrollTop > 400
    });
  },

  // 加载题目列表
  async loadQuestions(refresh = false) {
    if (this.data.loading) return;

    const page = refresh ? 1 : this.data.page;
    
    this.setData({ loading: true });

    
    try {
      const params = {
        page,
        pageSize: this.data.pageSize,
        keyword: this.data.searchValue,
        filter: this.data.activeFilter,
        sort: this.data.sortType,
        categoryId: this.data.categoryId // 添加分类ID参数
      };

      // 过滤空参数
      const filteredParams = Object.keys(params).reduce((acc, key) => {
        if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
          acc[key] = params[key];
        }
        return acc;
      }, {});

      console.log('请求参数:', filteredParams);
      const questionParams = new QuestionParams(null, this.data.categoryId, null)
      const response = await authApi.getQuestionList(questionParams);
      
      if (response.code === "0000") {
        const newList = response.data.rows || [];
        const total = response.data.total || 0;
        
        if (refresh) {
          this.setData({
            questionList: newList,
            totalCount: total,
            page: 1,
            hasMore: newList.length >= this.data.pageSize
          });
        } else {
          this.setData({
            questionList: [...this.data.questionList, ...newList],
            totalCount: total,
            page: page + 1,
            hasMore: newList.length >= this.data.pageSize
          });
        }
      } else {
        Message.error(response.message || '加载失败');
      }
    } catch (error) {
      console.error('加载题目列表失败:', error);
      Message.error('网络错误，请重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 搜索相关
  onSearchChange(e) {
    this.setData({
      searchValue: e.detail.value
    });
  },

  onSearch() {
    this.loadQuestions(true);
  },

  // 筛选条件改变
  onFilterChange(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      activeFilter: value
    }, () => {
      this.loadQuestions(true);
    });
  },

  // 排序改变
  onSortChange(e) {
    this.setData({
      sortType: e.detail.value
    }, () => {
      this.loadQuestions(true);
    });
  },

  // 收藏/取消收藏
  async onCollect(e) {
    const questionId = e.currentTarget.dataset.id;
    const question = this.data.questionList.find(item => item.id === questionId);
    
    if (!question) return;

    try {
      const response = await authApi.toggleCollect({
        questionId: questionId,
        collect: !question.isCollected
      });

      if (response.code === "0000") {
        // 更新本地收藏状态
        const updatedList = this.data.questionList.map(item => {
          if (item.id === questionId) {
            return {
              ...item,
              isCollected: !item.isCollected
            };
          }
          return item;
        });

        this.setData({
          questionList: updatedList
        });

        Message.success(question.isCollected ? '已取消收藏' : '收藏成功');
      } else {
        Message.error(response.message || '操作失败');
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
      Message.error('操作失败，请重试');
    }
  },

  // 刷新收藏状态
  async refreshCollectStatus() {
    // 可以调用接口获取最新的收藏状态
    // 这里简单实现：重新加载第一页数据
    if (this.data.questionList.length > 0) {
      this.loadQuestions(true);
    }
  },

  // 加载更多
  loadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadQuestions(false);
    }
  },

  // 滚动到顶部
  scrollToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300
    });
  },

  // 获取难度主题色
  getDifficultyTheme(difficulty) {
    const themes = {
      easy: 'success',
      medium: 'warning',
      hard: 'danger'
    };
    return themes[difficulty] || 'outline';
  },

  // 获取难度文本
  getDifficultyText(difficulty) {
    const texts = {
      easy: '简单',
      medium: '中等',
      hard: '困难'
    };
    return texts[difficulty] || '未知';
  },

  // 发布题目
  goRelease() {
    wx.navigateTo({
      url: `/pages/release/question/index?categoryId=${this.data.categoryId}`
    });
  },

   // 点击问题项跳转到详情
   onQuestionClick(e) {
    const questionId = e.currentTarget.dataset.id;
    const questionTitle = e.currentTarget.dataset.title;
    
    console.log('点击问题:', questionId, questionTitle);
    
    // 跳转到问题详情页面
    wx.navigateTo({
      url: `/pages/question/detail/index?id=${questionId}&title=${questionTitle}`
    });
  }
});