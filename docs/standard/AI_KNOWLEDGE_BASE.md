# 小程序 AI 知识库上下文

## 1. 一句话背景

这是一个微信原生小程序，使用 TDesign + Less，面向面试题库、刷题、内容创作、个人中心、AI 问答和移动管理能力。

## 2. AI 处理任务时优先阅读

- `docs/README.md`：文档中心与技术方案管理规范（新功能方案写入 `docs/tech/`）。
- `app.json`：页面注册、分包、TabBar。
- `api/api_request.js`：请求、token、业务错误、ECDH 加密。
- `api/index.js`：API 统一出口。
- `utils/router.js`：页面跳转、登录回跳、`ensureLogin`（互动鉴权）。
- `app.js`：全局登录态、用户信息缓存、事件总线。
- 目标页面的 `index.js/wxml/less/json`。
- 相关功能方案：`docs/tech/*.md`（若已有）。

## 3. 关键约束

- 不直接使用 `wx.request`，必须走 `api/api_request.js`。
- 不直接拼接完整后端域名，使用配置里的 `baseUrl + apiPrefix`。
- 登录态不要自行发明字段，优先使用 `access_token` 和 `user_info`。
- 小程序前端权限只做展示，真正权限必须由后端控制。
- 不要把后台 `/admin/**` 接口直接暴露给小程序调用。
- 新增低频页面优先走分包或独立页面，避免主包持续膨胀。

## 4. 常见开发任务模板

### 新增接口

1. 在 `api/request/api_xxx.js` 新增接口方法。
2. 在 `api/index.js` 导出。
3. 页面中 `import { xxxApi, handleApiError } from '~/api/index'`。
4. 统一处理 loading、empty、error。

### 新增页面

1. 创建页面四件套。
2. 在 `app.json` 注册。
3. `index.json` 声明 TDesign 组件。
4. 需要登录的页面或入口使用 `app.navigateToLogin`。
5. 列表页实现分页和下拉刷新。

### 新增个人中心入口

1. 在 `pages/my/index.js` 添加入口数据或权限探测逻辑。
2. 在 `pages/my/index.wxml` 增加卡片或服务项。
3. 在 `pages/my/index.less` 补样式。
4. 点击时使用 `openPage` 或 `app.navigateToLogin`。

## 5. 当前重点业务知识

### 内容状态

```text
0 草稿
1 待审核
2 已发布
3 已下架
4 已驳回
```

### 主页资料审核状态

```text
0 待审核
1 正常
2 已驳回
3 已重置
```

### 移动管理台

页面（分包）：

```text
subpackages/mobileAdmin/index
```

API：

```text
api/request/api_mobile_admin.js
```

后端前缀：`/mobile/admin/**`

一期：内容审核、资料审核、分类建议。  
二期：举报处理、评论隐藏、商务线索、积分申诉、内容下架。

权限来自后端 RBAC，不在小程序硬编码手机号。相关方案见 `docs/tech/2026-07-mobile-admin.md`（改动时需同步更新）。

## 6. AI 修改代码时的注意事项

- 修改已有页面前先阅读同目录四件套，保持局部风格。
- 修改用户态相关代码时，重点检查登录过期、回跳、缓存清理。
- 修改请求层时要谨慎，因为全项目共享。
- 修改 `app.json` 时注意页面路径、分包路径和 TabBar 路径。
- 新增 UI 优先参考 `pages/my`、`pages/document`、`pages/ucenter` 的卡片风格。
- 完成或变更功能技术方案后，写入 `docs/tech/` 并更新 `docs/README.md` / `docs/tech/README.md` 索引（见 `.cursor/rules/docs-tech-solutions.mdc`）。
