# 小程序移动管理台方案整理

> 记录时间：2026-07-29  
> 修订时间：2026-07-30（一期 RBAC + 二期扩展 + 管理台交互优化）  
> 涉及项目：
>
> - 小程序：`/Users/dinghaojie/WeChatProjects/interview_miniprogram`
> - 后台管理：`/Users/dinghaojie/WeChatProjects/admin_manage`
> - 后端：`/Users/dinghaojie/IdeaProjects/interview_handbook`

## 1. 目标

在现有小程序功能不变的前提下，提供“小程序移动管理台”，让具备后台 RBAC 权限的用户在手机上处理高频审批与治理操作。

### 一期（已完成）

- 内容审核：题目/文章待审列表、通过、驳回（含原因）
- 主页资料审核：通过、驳回、重置
- 分类建议：采纳、驳回

### 二期（已完成）

- 举报处理：待处理列表、处理（含处置动作）、驳回
- 评论治理：可见评论列表、隐藏
- 商务线索：待处理列表、跟进、关闭、复制手机号
- 积分申诉：待处理列表、通过（返还积分）、驳回
- 内容下架：已发布列表、强制下架

## 2. 架构约束

- 不直连 `/admin/**`，不使用 `@SaCheckPermission`（会强制管理端 client）。
- 小程序专用接口：`/mobile/admin/**`。
- Controller 只做 applet 登录边界；Service 内手动 `hasRole/hasPermission`，并复用已有业务 Service。

## 3. 分层结构

| 层级       | 路径                                            | 职责                      |
| ---------- | ----------------------------------------------- | ------------------------- |
| Controller | `MobileAdminController`                         | `checkAppletLogin` + 转发 |
| Service    | `MobileAdminService` / `MobileAdminServiceImpl` | 权限码、overview、编排    |
| VO         | `MobileAdminOverviewVO` / `MobileAdminModuleVO` | 模块可见性与按钮能力      |

小程序：

- 分包：`subpackages/mobileAdmin`（跳转路径 `/subpackages/mobileAdmin/index`）
- API：`api/request/api_mobile_admin.js`
- 「我的」页 overview 探测入口

## 4. 接口一览

前缀：`/mobile/admin`

| 模块     | 方法     | 路径                                             |
| -------- | -------- | ------------------------------------------------ | ------ | -------- |
| 概览     | GET      | `/overview`                                      |
| 内容     | GET/POST | `/questions`、`/questions/{id}/approve           | reject | offline` |
| 资料     | GET/POST | `/profiles`、`/profiles/{userId}/approve         | reject | reset`   |
| 分类建议 | GET/POST | `/category-suggestions`、`.../handle`            |
| 举报     | GET/POST | `/reports`、`/reports/{id}/handle`               |
| 评论     | GET/POST | `/comments`、`/comments/{id}/hide`               |
| 线索     | GET/POST | `/business-leads`、`/business-leads/{id}/handle` |
| 申诉     | GET/POST | `/appeals`、`/appeals/resolve`                   |

## 5. 权限码

### 一期

```text
repository.question.query_table / approve_btn / reject_btn
social.profile.query_table / approve_btn / reject_btn / reset_btn
repository.category.query_table / add_btn
```

### 二期新增

```text
social.report.query_table / handle_btn
repository.comment.query_table / hide_btn
business.lead.query_table / handle_btn
points.admin.appeal_list_btn / appeal_resolve_btn
repository.question.offline_btn
```

`MobileAdminModuleVO` 字段：

- `visible`：模块入口
- `canApprove` / `canReject` / `canReset` / `canHandle`：按钮能力
- `pendingCount`：待办数（评论/下架模块恒为 0，不做伪待办）

## 6. 配置与 SQL

1. `V1.49__mobile_admin_audit_menu_buttons.sql`：内容审核按钮
2. `V1.50__content_questions_reject_reason.sql`：驳回原因字段
3. `V1.51__mobile_admin_phase2_menu_buttons.sql`：评论隐藏、积分申诉、商务线索菜单

配置角色后需**重新登录小程序**。超管旁路：`user_tag_cd=1001002` → 角色 `admin`。

## 7. 交互注意

- 举报「处理」会弹出处置动作：NONE / WARN / HIDE_CONTENT / RESET_PROFILE / MUTE_USER / BAN_USER；禁言/封禁二次确认。
- 积分申诉「通过」会按原流水返还积分，需二次确认。
- 强制下架会通知作者并触发下架积分事件。
- 作者侧发布列表支持「已驳回」Tab，展示 `rejectReason`。

### 页面交互（2026-07-30 优化）

参考钉钉/企微「待办收件箱」形态，弱化营销式 Hero，强化扫一眼就能处理：

1. **顶部摘要**：待办合计 + 当前队列条数，一眼看出压力。
2. **模块切换**：横向胶囊 Chip（短标题 + 红点徽标），替代横向大卡片，减少横向滚动成本。
3. **任务卡**：类型点色 + 标题/元信息/正文预览分层；底部大触控按钮（次要灰底 / 主操作实色）。
4. **线索电话**：整行可点复制，避免小字难戳。
5. **分类建议**：按「命名提案」布局——突出建议名、挂靠→新建路径、关联文档/兜底分类事实行、用户说明引用块；主按钮文案为「采纳并创建」。
6. 业务动作与权限逻辑不变，仅前端信息架构与触控区调整。

## 8. 明确不迁到手机端

系统 RBAC、字典/配置、AI 模型密钥、积分规则/商品 CRUD、分类树编辑、Banner 素材编辑、手填 ID 调账工具。

## 9. 验证 Checklist

1. 执行 V1.49 / V1.50 / V1.51。
2. 重启后端（Java 21）。
3. 给目标角色勾选二期权限并保存，确认 `sys_role_menu`。
4. 小程序退出重登。
5. overview 各模块 `visible/pendingCount` 正确。
6. 逐模块测通过/驳回/处理/隐藏/下架。
7. 无权限账号入口不可见。

## 10. 主要改动文件

### 后端

```text
MobileAdminController.java
MobileAdminService.java
MobileAdminServiceImpl.java
MobileAdminOverviewVO.java
MobileAdminModuleVO.java
V1.51__mobile_admin_phase2_menu_buttons.sql
```

### 小程序

```text
api/request/api_mobile_admin.js
subpackages/mobileAdmin/index.js|wxml|json|less
pages/my/index.js
app.json（分包）
docs/mobile-admin-approval-plan.md
```
