# 小程序项目开发标准

## 1. 项目定位

`interview_miniprogram` 是面试题库微信小程序，主要承载题库浏览、刷题、内容创作、个人中心、积分、社交资料、AI 问答等 C 端能力。

核心原则：

- 保持 C 端体验轻量、稳定、低学习成本。
- 所有敏感操作必须以后端鉴权为准，前端只做展示和交互控制。
- 小程序端新增低频能力优先放分包，避免主包膨胀。

## 2. 技术栈

- 框架：微信原生小程序。
- UI：TDesign Miniprogram。
- 样式：Less。
- 语言：JavaScript。
- Markdown：towxml 分包。
- 请求：`api/api_request.js` 统一封装。
- 路由：`utils/router.js` 统一处理登录跳转、Tab 跳转、普通页面跳转。
- 加密：`utils/encryption.js` 处理 ECDH 会话与响应解密。

## 3. 目录结构标准

```text
api/
  api_request.js              # 请求核心封装
  index.js                    # API 统一出口
  request/                    # 按业务域拆分 API
  param/                      # 参数对象与校验

components/                   # 公共组件
behaviors/                    # 页面行为复用
utils/                        # 工具、业务适配、缓存与路由
pages/                        # 主包页面和业务分包
custom-tab-bar/               # 自定义 TabBar
subpackages/towxml/           # Markdown 渲染分包
config/                       # 环境配置
Standard/                     # 项目标准文档
```

## 4. 页面开发规范

每个页面使用四件套：

```text
index.js
index.wxml
index.less
index.json
```

页面标准：

- 页面数据集中写在 `data`，避免散落临时字段。
- 异步加载必须有 loading、empty、error 或 fallback 策略。
- 用户态页面统一使用 `app.navigateToLogin({ url })` 保护。
- 下拉刷新必须最终调用 `wx.stopPullDownRefresh()`，全局已做兜底，但页面逻辑仍应清晰。
- 列表页建议统一支持 `page`、`limit`、`total`、`hasMore`、`loading`。

## 5. API 开发规范

新增 API 必须放在 `api/request/`，并在 `api/index.js` 导出。

命名规范：

```text
api/request/api_xxx.js
export const xxxApi = {}
```

请求规范：

- 使用 `http.get/post/put/delete`。
- 不直接调用 `wx.request`。
- 默认响应结构为 `{ code, message, data }`。
- 页面错误处理使用 `handleApiError`。
- 普通对象参数可直接传入；复杂参数可使用 `api/param` 参数类。

示例：

```javascript
import http from '../api_request';

export const demoApi = {
  list: (params) =>
    http.get('/demo/list', params, {
      showLoading: false,
    }),
};
```

## 6. 登录与权限标准

存储键：

- `access_token`
- `refresh_token`
- `user_info`
- `return_url`
- `login_referrer`

规则：

- 登录态以 token + user_info 为基础。
- 小程序端不做最终权限判断，最终以后端返回 401/403/业务错误为准。
- 需要隐藏入口时，可以先调用后端 overview/probe 接口。
- 管理能力不要硬编码手机号，应使用后端角色/权限配置。

## 7. 样式与 UI 标准

- 优先使用 TDesign 组件。
- 页面背景、卡片、圆角、阴影与“我的”页风格保持一致。
- 常见容器使用卡片式结构：白底、`24rpx` 外边距、`24rpx-32rpx` 圆角。
- 操作按钮在移动端应清晰分主次：主操作用 `success/primary`，危险操作用 `danger`。
- 低频复杂操作使用 Modal/Popup 二次确认。

## 8. 分包策略

适合放分包：

- 详情页。
- 管理页。
- 发布页。
- 数据中心。
- 低频个人中心功能。
- 大体积 Markdown 渲染。

不建议放主包：

- 管理审批。
- 复杂编辑器。
- 大列表低频页。

## 9. 常见功能模块

- 题库：`pages/category`、`pages/question`
- 速记：`pages/interviewMemo`
- AI：`pages/mknow`
- 创作：`pages/publish`、`pages/document`、`pages/creator`
- 搜索：`pages/search`
- 个人中心：`pages/my`、`pages/ucenter`
- 设置：`pages/setting`
- 移动管理台：`subpackages/mobileAdmin`

## 10. 开发检查清单

提交前至少确认：

- 页面已在 `app.json` 注册。
- 新 API 已在 `api/index.js` 导出。
- 需要登录的入口使用 `navigateToLogin`。
- 错误走 `handleApiError` 或明确 Toast。
- 列表有 empty/loading 状态。
- 没有绕过 `api_request.js`。
- 没有把手机号、token、密钥写死在前端。
