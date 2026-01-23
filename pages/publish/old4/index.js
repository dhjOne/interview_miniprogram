//获取应用实例
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    docTitle: '', // 文档标题
    markdownContent: '', // 原始Markdown内容
    renderedContent: '' // towxml渲染后的内容
  },

  /**
   * 监听标题输入
   */
  onTitleInput(e) {
    this.setData({
      docTitle: e.detail.value
    });
  },

  /**
   * 监听Markdown内容输入，实时转换并渲染
   */
  onContentInput(e) {
   
    const content = e.detail.value;
    // 使用towxml转换Markdown为小程序可渲染的节点
    console.log('content==========',content)
    const renderData = app.towxml(content, 'markdown');
    // 给转换后的内容添加样式（可选，优化显示）
    renderData.theme = 'light'; // 主题：light/black
    this.setData({
      markdownContent: content,
      renderedContent: renderData
    });
  },

  /**
   * 发布文档逻辑
   */
  onPublish() {
    const { docTitle, markdownContent } = this.data;
    // 模拟发布：实际开发中替换为调用后端接口
    wx.showLoading({
      title: '发布中...'
    });
    // 这里可将docTitle和markdownContent提交到后端存储
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: '发布成功',
        icon: 'success'
      });
      // 发布成功后可跳转或清空内容
      // this.setData({ docTitle: '', markdownContent: '', renderedContent: '' });
    }, 1000);
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 初始化示例Markdown内容（可选，方便测试）
    const demoMd = `# 小程序开发实战：towxml使用教程

## 一、核心功能
- 支持Markdown/HTML渲染
- 代码高亮（支持JavaScript、Python、Java等）
- 支持LaTex数学公式、Mermaid流程图

## 二、代码示例
\`\`\`javascript
// 微信小程序页面逻辑
Page({
  data: {
    content: 'Hello towxml!'
  }
});
\`\`\`

## 三、数学公式
欧拉公式：$e^{i\\pi} + 1 = 0$

## 四、表格示例
| 组件 | 功能 | 适用场景 |
|------|------|----------|
| towxml | Markdown渲染 | 技术文档、博客 |
| vant-weapp | UI组件 | 小程序页面布局 |
`;
    this.onContentInput({ detail: { value: demoMd } });
  }
});