# 三端协作标准

## 1. 三个仓库职责

| 仓库     | 路径                                                     | 职责                                                  |
| -------- | -------------------------------------------------------- | ----------------------------------------------------- |
| 小程序   | `/Users/dinghaojie/WeChatProjects/interview_miniprogram` | C 端用户体验、刷题、创作、个人中心、移动管理入口      |
| 后台管理 | `/Users/dinghaojie/WeChatProjects/admin_manage`          | 管理员 Web 控制台、RBAC、审批、运营、系统配置         |
| 后端     | `/Users/dinghaojie/IdeaProjects/interview_handbook`      | API、认证鉴权、业务规则、数据持久化、微信/AI/积分集成 |

## 2. 总体架构原则

- 小程序和后台管理不直接共享前端代码，但共享后端业务状态和权限模型。
- 后台管理面向管理端 token，小程序面向 applet token。
- `/admin/**` 仅允许后台管理调用。
- 小程序如需管理能力，应使用专用移动管理接口，例如 `/mobile/admin/**` 或 `/wechat/mini/admin/**`。
- 审批、状态流转、积分发放、资料重置等最终业务规则必须放后端。

## 3. API 协作标准

统一响应结构：

```json
{
  "code": "0000",
  "message": "success",
  "data": {}
}
```

分页结构：

```json
{
  "current": 1,
  "limit": 10,
  "totalPage": 1,
  "total": 0,
  "rows": []
}
```

错误处理：

- 登录过期：`C105` 或 HTTP 401。
- 无权限：HTTP 403 或权限业务码。
- 小程序和后台前端只负责友好提示，不能吞掉后端权限错误。

## 4. 权限标准

后台管理：

- 使用 `LoginUser` 会话。
- 通过 Sa-Token + RBAC 校验。
- 菜单和按钮权限由 `sys_menu.permissions` 定义。
- 角色通过 `sys_user_role`、`sys_role_menu` 绑定。

小程序：

- 使用 applet client。
- 普通用户默认无管理权限。
- 有管理需求时，后端根据同一个 `sys_user` 加载 roles/permissions。
- 前端只展示有权限的入口和按钮，后端必须再次校验。

不要做：

- 不要在小程序硬编码手机号控制权限。
- 不要让小程序直接调用 `/admin/**`。
- 不要把后台管理 token 放进小程序。

## 5. 状态标准

内容状态：

```text
0 草稿
1 待审核
2 已发布
3 已下架
4 已驳回
```

用户主页审核状态：

```text
0 待审核
1 正常
2 已驳回
3 已重置
```

分类建议状态：

```text
0 待处理
1 已采纳
2 已驳回
```

举报状态：

```text
0 待处理
1 已处理
2 已驳回
```

积分申诉状态：

```text
0 待处理
1 已通过
2 已驳回
```

## 6. 新功能开发流程

### 6.1 C 端功能

1. 后端定义接口和业务规则。
2. 小程序新增 API 封装。
3. 小程序新增页面或入口。
4. 后端补充必要状态字段。
5. 小程序处理 loading、empty、error、登录回跳。

### 6.2 管理端功能

1. 后端新增 `/admin/**` Controller 或复用已有 Controller。
2. 后端加 `@SaCheckPermission`。
3. 后台管理新增 API 模块。
4. 后台管理新增页面和菜单。
5. 后台 RBAC 配置菜单和按钮权限。

### 6.3 小程序移动管理功能

1. 后端新增非 `/admin/**` 的小程序管理接口。
2. 后端使用 `LoginUtils.checkAppletAccess()`。
3. 后端手动判断角色/权限，不使用 `@SaCheckPermission`。
4. 小程序新增 overview 权限探测。
5. 小程序根据权限展示入口、模块、按钮。
6. 变更后同步更新 `docs/mobile-admin-approval-plan.md`（长期约定）。

当前移动管理台覆盖：内容审核、资料审核、分类建议、举报处理、评论隐藏、商务线索、积分申诉、内容下架。

## 7. AI 知识库使用建议

向 AI 提需求时建议包含：

- 目标仓库。
- 目标模块。
- 端类型：小程序 / 后台管理 / 后端。
- 是否涉及权限。
- 是否涉及状态流转。
- 是否需要改数据库。
- 是否需要兼容已有数据。

示例：

```text
在小程序新增积分申诉入口，后端已有 /points 相关接口，不要改后台管理。请先阅读 Standard，再按现有页面风格实现。
```

## 8. 跨端命名约定

- 后端参数：`Param`。
- 后端返回：`VO`。
- 后台管理 API：`src/api/modules/{domain}`。
- 小程序 API：`api/request/api_{domain}.js`。
- 状态字段优先使用后端原字段，不在前端重新发明字段名。
- 权限码以业务域开头，例如 `repository.question.approve_btn`。
