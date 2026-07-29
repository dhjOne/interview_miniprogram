# 小程序移动管理台方案整理

> 记录时间：2026-07-29
> 涉及项目：
> - 小程序：`/Users/dinghaojie/WeChatProjects/interview_miniprogram`
> - 后台管理：`/Users/dinghaojie/前端/sz-admin`
> - 后端：`/Users/dinghaojie/IdeaProjects/interview_handbook`

## 1. 目标

在现有小程序功能不变的前提下，新增一套“小程序移动管理台”，让指定管理员或具备指定角色/权限的用户，可以在小程序里处理部分后台管理操作。

第一期聚焦高频审批能力：

- 内容审核：题目/文章待审核列表、通过、驳回。
- 主页资料审核：用户公开资料待审核列表、通过、驳回、重置。
- 分类建议处理：用户提交的分类建议列表、采纳、驳回。

后续可扩展：

- 举报处理。
- 评论隐藏。
- 积分申诉处理。
- 商务线索跟进。
- 运营位/Banner 管理。

## 2. 核心结论

不能直接让小程序调用后台 `/admin/**` 接口，也不能直接在小程序接口上复用 `@SaCheckPermission`。

原因：

- 后端 `AdminRouteMatcher` 会拦截 `/admin/**`、`/sys-*`、`/system/**` 等管理路径，要求管理端 client。
- 自定义 `MySaCheckPermissionHandler` 在校验权限前会先执行 `LoginUtils.checkAdminAccess()`。
- 小程序 token 的 clientKey 是 `applet`，后台管理 token 的 clientKey 是 `sz-admin`，所以小程序 token 会被管理端边界拦住。

因此本次采用的方案是：

- 新增小程序专用移动管理接口：`/mobile/admin/**`。
- 接口内部先校验小程序登录和 applet client。
- 再手动判断当前用户是否拥有后台角色或权限码。
- 业务逻辑仍复用现有 Service，不重复写审批规则。

## 3. 本次实现概览

### 3.1 后端改动

后端仓库：`/Users/dinghaojie/IdeaProjects/interview_handbook`

已新增/修改：

- `interview-handbook-web/src/main/java/com/handbook/web/controller/interview/MobileAdminController.java`
- `interview-handbook-service/src/main/java/com/handbook/service/strategy/login/AppletStrategy.java`
- `interview-handbook-service/src/main/java/com/handbook/service/service/miniuser/impl/MiniProfileServiceImpl.java`

关键点：

- 小程序登录后，Sa-Token 会话中缓存带角色/权限的 `LoginUser`。
- 小程序接口仍返回原来的 `MiniLoginUser` 给前端，不改变前端登录数据结构。
- `MobileAdminController` 使用手动权限判断，不使用 `@SaCheckPermission`。
- 非授权用户访问时返回无权限错误。

### 3.2 小程序改动

小程序仓库：`/Users/dinghaojie/WeChatProjects/interview_miniprogram`

已新增/修改：

- `api/request/api_mobile_admin.js`
- `api/index.js`
- `app.json`
- `pages/mobileAdmin/index.js`
- `pages/mobileAdmin/index.wxml`
- `pages/mobileAdmin/index.less`
- `pages/mobileAdmin/index.json`
- `pages/my/index.js`
- `pages/my/index.wxml`
- `pages/my/index.less`

关键点：

- 新增页面：`pages/mobileAdmin/index`
- “我的”页新增“移动管理台”入口。
- 入口会先调用 `/mobile/admin/overview` 探测权限。
- 没有权限时入口不展示。
- 有权限时展示待办数量和可访问模块。
- 页面按钮按 `canApprove`、`canReject`、`canReset` 控制显示。

## 4. 后端接口设计

接口前缀：`/mobile/admin`

### 4.1 概览

```http
GET /mobile/admin/overview
```

用途：

- 判断当前小程序用户是否有移动管理权限。
- 返回各模块是否可见、是否可通过/驳回/重置、待办数量。

响应数据示意：

```json
{
  "hasAccess": true,
  "questions": {
    "visible": true,
    "canApprove": true,
    "canReject": true,
    "canReset": false,
    "pendingCount": 3
  },
  "profiles": {
    "visible": true,
    "canApprove": true,
    "canReject": true,
    "canReset": true,
    "pendingCount": 1
  },
  "categories": {
    "visible": true,
    "canApprove": true,
    "canReject": true,
    "canReset": false,
    "pendingCount": 2
  }
}
```

### 4.2 内容审核

```http
GET /mobile/admin/questions
POST /mobile/admin/questions/{questionId}/approve
POST /mobile/admin/questions/{questionId}/reject
```

复用后端 Service：

- `ContentQuestionsService.pageForAdmin`
- `ContentQuestionsService.approveQuestion`
- `ContentQuestionsService.rejectQuestion`

### 4.3 主页资料审核

```http
GET /mobile/admin/profiles
POST /mobile/admin/profiles/{userId}/approve
POST /mobile/admin/profiles/{userId}/reject
POST /mobile/admin/profiles/{userId}/reset
```

复用后端 Service：

- `SocialUserService.pageProfilesForAdmin`
- `SocialUserService.adminApproveProfile`
- `SocialUserService.adminRejectProfile`
- `SocialUserService.adminResetProfile`

### 4.4 分类建议

```http
GET /mobile/admin/category-suggestions
POST /mobile/admin/category-suggestions/{suggestionId}/handle
```

复用后端 Service：

- `ContentCategorySuggestionsService.pageForAdmin`
- `ContentCategorySuggestionsService.handle`

## 5. 权限配置方式

推荐继续使用后台管理现有 RBAC，不在代码里硬编码手机号。

手机号只用于定位用户，真正权限来自角色/菜单/按钮权限。

例如要给手机号 `18201858574` 配置移动管理权限：

1. 确认该手机号对应的用户已经存在于 `sys_user`。
2. 在后台创建角色，例如：`mobile_auditor` / `小程序审核员`。
3. 给角色勾选需要的菜单/按钮权限。
4. 把角色分配给手机号 `18201858574` 对应的用户。
5. 用户重新登录小程序，让新 token 带上最新角色/权限。

### 5.1 最小权限组合

只做题目/文章审核：

```text
repository.question.query_table
repository.question.approve_btn
repository.question.reject_btn
```

做主页资料审核：

```text
social.profile.query_table
social.profile.approve_btn
social.profile.reject_btn
social.profile.reset_btn
```

做分类建议处理：

```text
repository.category.query_table
repository.category.add_btn
```

完整移动管理台一期权限：

```text
repository.question.query_table
repository.question.approve_btn
repository.question.reject_btn

social.profile.query_table
social.profile.approve_btn
social.profile.reject_btn
social.profile.reset_btn

repository.category.query_table
repository.category.add_btn
```

注意：

- 必须有 `query_table` 权限，否则小程序看不到对应模块列表。
- 有列表权限但没有按钮权限时，可以查看列表，但不会显示对应操作按钮。
- `admin` 超级角色默认通过。

## 6. 小程序页面交互

页面：`pages/mobileAdmin/index`

结构：

- 顶部渐变概览卡片。
- 模块卡片：内容审核、资料审核、分类建议。
- 列表卡片展示关键字段。
- 操作按钮：通过、驳回、重置、采纳。
- 下拉刷新和触底加载。

“我的”页入口：

- 登录后调用 `mobileAdminApi.getOverview()`。
- `hasAccess=false` 时不展示入口。
- `hasAccess=true` 时展示“移动管理台”卡片和待办数量。

## 7. 当前验证情况

已执行：

```bash
npx eslint pages/mobileAdmin/index.js pages/my/index.js api/request/api_mobile_admin.js --no-eslintrc -c ./.eslintrc.js
```

结果：

- 小程序新增 JS lint 通过。

后端 Maven 编译情况：

- 项目目标 Java 21。
- 当前命令行 `java -version` 显示 Java 21。
- 但 `mvn -v` 显示 Maven 固定使用 Java 8。
- 因此 `mvn -pl interview-handbook-web -am -DskipTests compile` 会失败，错误为：

```text
无效的目标发行版: 21
```

这属于本机 Maven/JDK 环境问题，本次没有修改全局 Java/Maven 配置。

## 8. 明天需要重点确认

### 8.1 接口路径是否调整

当前实现使用：

```text
/mobile/admin/**
```

后端探索建议也可以用：

```text
/wechat/mini/admin/**
```

两种都可行，关键是不要使用 `/admin/**`，也不要使用 `@SaCheckPermission`。

明天可以决定是否统一成 `wechat/mini/admin` 这种更贴近现有小程序接口风格的路径。

### 8.2 是否需要硬性手机号白名单

当前方案不硬编码手机号，而是使用角色/权限。

如果确实要做“手机号白名单”，建议也不要写死在代码里，可以做成：

- 系统配置项。
- 数据库表。
- 后台可维护的移动管理员名单。

但优先建议继续使用 RBAC，因为后台已经有完整角色体系。

### 8.3 普通用户登录是否受影响

本次小程序登录会话从 `MiniLoginUser` 改为 `LoginUser`，目的是让 Sa-Token 能读到 roles/permissions。

需要重点回归：

- 普通用户小程序登录。
- 个人资料编辑。
- 职业选择。
- 题目发布。
- 收藏/点赞/评论。

目前前端登录返回数据仍是 `MiniLoginUser`，理论上不影响小程序页面数据。

### 8.4 数据权限范围

当前移动管理台手动判断权限码，不走 `@SaCheckPermission`，因此不会触发注解里设置的 `ControlThreadLocal` 数据权限上下文。

如果后台角色有复杂数据权限规则，明天需要确认移动端是否也必须严格套用同样的数据范围。

第一期如果只是“指定管理员可处理全部移动审批”，当前方案够用。

### 8.5 是否补充更多管理模块

可以继续扩展：

- 举报处理：`social.report.handle_btn`
- 评论隐藏：`repository.comment.hide_btn`
- 积分申诉：`points.admin.appeal_resolve_btn`
- 商务线索：`business.lead.handle_btn`

建议分批做，先把内容审核、资料审核、分类建议跑通。

## 9. 明天继续梳理 Checklist

1. 启动后端前先修正 Maven 使用 Java 21。
2. 后端编译通过后启动服务。
3. 用手机号 `18201858574` 登录小程序。
4. 在后台给该用户配置角色和权限。
5. 让该用户重新登录小程序。
6. 检查“我的”页是否出现“移动管理台”。
7. 检查三个模块待办数量是否正确。
8. 分别测试通过、驳回、重置、采纳。
9. 用无权限账号登录，确认入口不可见、接口不可访问。
10. 决定接口前缀是否保留 `/mobile/admin` 或改成 `/wechat/mini/admin`。

## 10. 当前改动文件清单

小程序：

```text
api/index.js
api/request/api_mobile_admin.js
app.json
pages/mobileAdmin/index.js
pages/mobileAdmin/index.wxml
pages/mobileAdmin/index.less
pages/mobileAdmin/index.json
pages/my/index.js
pages/my/index.wxml
pages/my/index.less
```

后端：

```text
interview-handbook-service/src/main/java/com/handbook/service/strategy/login/AppletStrategy.java
interview-handbook-service/src/main/java/com/handbook/service/service/miniuser/impl/MiniProfileServiceImpl.java
interview-handbook-web/src/main/java/com/handbook/web/controller/interview/MobileAdminController.java
```
