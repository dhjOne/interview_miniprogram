# 题目分享技术方案

> 状态：**已落地**（含 §8 中/低优先级 backlog）  
> 记录时间：2026-07-31  
> 续接入口：本文 + [tech 索引](./README.md) + [docs 中心](../README.md)  
> 涉及项目：
>
> - 小程序：`interview_miniprogram`（本仓库）
> - 后端：`interview_handbook`（本机路径常为 `/Users/dinghaojie/IdeaProjects/interview_handbook`）
>
> **换电脑续做时**：先 `git pull` 本仓库（确保 `docs/tech/` 已推送），再让 AI 阅读本文 §0 / §8，不要只依赖聊天记录。

## 0. 跨设备续接（2026-07-31 收尾）

### 0.1 已完成（主链路 + backlog）

| 块         | 内容                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| 分享闭环   | 好友转发 / 朋友圈 / 复制 **URL Link**；path 带 `from=share&channel&sharerId` |
| 分享计数   | `POST .../share`（initiate 计次 / open 回流）；详情与创作者洞察展示 share    |
| 登录策略   | **方案 A**：详情可读免登；赞/藏/评/关注/举报要登录；列表入口统一 `openPage`  |
| 互动体验   | 未登录轻提示 → 登录 → `pendingAction` 自动续做                               |
| 高价值三项 | ① 访客底栏弱提示 ② 续做成功 Toast ③ 分享卡片默认 `imageUrl`                  |
| M1         | `interaction_shares.sharer_id` 落库；open 回流写入原分享者                   |
| M2         | 分享面板「微信好友」`button open-type="share"` 直达系统分享                  |
| M3         | view / share 按 IP+用户+题目 Redis 去重窗口防刷                              |
| L1         | 朋友圈单页模式（scene=1154）隐藏底栏/关注等重交互                            |
| L2         | URL Link 失败时复制小程序 path 并明确降级提示                                |
| L3         | 评论输入聚焦即轻提示登录（`comment_focus`）                                  |
| L4         | 详情返回 `coverUrl`（内容首图）；无图时前端默认 `/static/home/card0.png`     |
| D1         | 移动管理台方案迁入 `docs/tech/2026-07-mobile-admin.md`                       |

### 0.2 仍需真机补验

§7 验证清单需在真机 / 正式环境勾选（尤其 URL Link 能力开通、朋友圈单页模式）。

### 0.3 给下一台电脑上的 AI / 自己

```text
请阅读 docs/tech/2026-07-question-share.md。
功能已落地；优先补 §7 真机验证。产品结论仍是方案 A。
后端迁移：V1.52__interaction_shares_sharer_id.sql（Flyway 若未自动跑需手动执行）。
```

相关会话（本机 Cursor）：[题目分享与免登](f6142229-0dda-4b8c-8f5a-0d5d285aaee1)（换机后可能不可用，**以本文为准**）。

## 1. 目标

- 题目详情支持转发给好友、分享到朋友圈、复制可打开的链接。
- 客户通过分享卡片 / URL Link 打开后，**无需登录即可阅读**正文。
- 点赞、收藏、评论、关注、举报等互动仍需登录。
- 统计分享次数，并在详情与创作者数据洞察中展示。

## 2. 方案结论

| 能力         | 选型                                      | 说明                                                                                    |
| ------------ | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| 转发给好友   | `onShareAppMessage` + `open-type="share"` | 自定义 title / path / imageUrl；面板直达系统分享                                        |
| 分享到朋友圈 | `onShareTimeline` + `enableShareTimeline` | 需页面实现回调；单页模式隐藏重交互                                                      |
| 复制链接     | 微信 **URL Link**                         | 复制 `https://wxaurl.cn/...`，失败时降级复制小程序 path                                 |
| 登录策略     | 方案 A：可读免登 / 互动要登录             | 详情页与详情接口不强制登录；入口统一 `openPage`；互动未登录轻提示，确认后登录并自动续做 |
| 分享计数     | 发起时上报 `initiate`                     | 微信无法确认是否真正发出，记「发起分享」；同窗口防刷                                    |

不采用：仅复制小程序 path 作为主路径（客户无法在会话外打开）。

## 3. 登录与入口策略（方案 A）

```text
题库/收藏/历史/主页/搜索 ──openPage──► 详情页（可读，免登）
分享卡片 / URL Link ───────────────► 详情页（可读，免登）
详情内 赞/藏/评/关注/举报 ──轻提示──► 去登录 ──回跳──► 自动续做刚才的操作
```

- 详情接口：`GET /repository/questions/detail`（`@SaIgnore`）。
- 前端辅助：`utils/router.js` → `ensureLogin` / `ensureLoginForAction`；`utils/pendingAction.js` 存待续动作。
- 列表进详情**不再**使用 `navigateToLogin`。
- 未登录点互动：弹窗「登录后即可…」/「去登录」/「先看看」；确认后带 `from=action` 进登录，成功回详情并续做。
- 访客态底栏弱提示：「登录后可点赞、收藏与评论」→ 去登录。
- 登录回跳自动续做成功后 Toast（如「已为你完成点赞」）。
- 分享卡片 `imageUrl`：优先题目 `coverUrl`（内容首图），否则默认 `/static/home/card0.png`。
- 评论：打开面板可看列表；未登录聚焦输入框即提示登录（`comment_focus`）。

## 4. 前后端约定

### 4.1 分享上报

`POST /repository/questions/{questionId}/share`（`@SaIgnore`）

```json
{
  "channel": "friend | timeline | copy | unknown",
  "action": "initiate | open",
  "sharerId": 123
}
```

| action     | 行为                                                                 |
| ---------- | -------------------------------------------------------------------- |
| `initiate` | 通过频控后 `share_count + 1`；登录用户写入 `interaction_shares`      |
| `open`     | 不计分享数；登录用户记 `open_*` 回流明细，并写入 `sharer_id`（若有） |

响应：`{ shareCount }`

防刷：同 IP / 登录用户 + 题目，view 30 分钟窗口、share 60 秒窗口内只计一次（Redis `SET NX`）。

### 4.2 生成复制用短链

`POST /repository/questions/{questionId}/share-link`（`@SaIgnore`）

```json
{
  "channel": "copy",
  "envVersion": "release | trial | develop",
  "expireDays": 30
}
```

响应：`{ urlLink, path, query, expireDays, envVersion }`

- 后端调微信 `wxa/generate_urllink`，Redis 缓存短链。
- 打开 path：`pages/question/detail/index`，query 含 `id`、`from=share`、`channel`、可选 `sharerId`。
- 前端失败时复制 path 并提示「仅开发者工具/内部可用」。

### 4.3 详情与洞察字段

- 详情：`shareCount`、`coverUrl`（内容块首张 image）
- 创作者洞察 overview：`totalShares`
- top：`sort=share`，条目含 `shareCount`
- trend：`metric=share`（按 `interaction_shares`，不含 `open_*`）

## 5. 关键实现落点

### 小程序

| 路径                                          | 职责                                           |
| --------------------------------------------- | ---------------------------------------------- |
| `utils/questionShare.js`                      | path 构建、上报、入口解析                      |
| `utils/router.js`                             | `ensureLogin` / `openPage` / `navigateToLogin` |
| `pages/question/detail/index.js`              | 分享回调、单页模式、分享回流上报、互动登录     |
| `pages/question/detail/behaviors/share.js`    | 面板、`open-type=share`、复制 URL Link / 降级  |
| `pages/question/detail/behaviors/comments.js` | 评论互动登录门禁、聚焦提示登录                 |
| `pages/question/detail/index.json`            | `enableShareTimeline`                          |
| `app.json`                                    | `window.enableShareTimeline`                   |
| `api/request/api_question.js`                 | `reportShare` / `getShareLink`                 |

### 后端

| 路径                            | 职责                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `WechatService#generateUrlLink` | 调微信 generate_urllink                                          |
| `QuestionRepositoryController`  | `/share`、`/share-link`、`/view`                                 |
| `ContentQuestionsServiceImpl`   | 累加 share/view、频控、写 sharer_id、coverUrl、短链              |
| `CreatorInsightsServiceImpl`    | share 排序与趋势                                                 |
| `V1.52__interaction_shares_sharer_id.sql` | `interaction_shares.sharer_id`                         |

## 6. 边界与注意

1. **URL Link** 需在微信公众平台开通对应能力；未开通会生成失败并走 path 降级。
2. 短链通常需在**微信内**打开；浏览器会引导「用微信打开」。
3. 未登录分享只累加 `share_count`（过频控后），不写 `interaction_shares`（表 `user_id` 非空）。
4. `sharerId`：前端 path 已传；open 回流且登录时写入 `interaction_shares.sharer_id`。
5. 朋友圈打开为单页模式（scene=1154），隐藏底栏 / 关注 / 目录等重交互，仅保留阅读。
6. 开发/体验版复制链接会带当前 `envVersion`，正式用户默认 `release`。
7. Flyway 若环境未启用，需**手动执行** `V1.52__interaction_shares_sharer_id.sql`。

## 7. 验证清单

- [ ] 未登录从题库进入详情可阅读
- [ ] 未登录底栏可见「登录后可点赞…」提示条
- [ ] 未登录点赞/评论会轻提示登录，登录后回详情并自动续做 + Toast
- [ ] 未登录聚焦评论输入即提示登录
- [ ] 右上角 / 面板「微信好友」转发，卡片带封面图（有图用 coverUrl），打开可免登阅读
- [ ] 朋友圈分享入口可见（真机）
- [ ] 朋友圈单页模式打开时无底栏重交互
- [ ] 复制链接得到 `https://` 短链，微信内打开进对应题目；失败时有 path 降级提示
- [ ] 分享后详情底栏 shareCount 增加（接口成功且未触发频控时）
- [ ] 创作者数据洞察可见「总分享」及 share 维度
- [ ] 重复快速刷新浏览量 / 分享不上涨（防刷）

## 8. 未完成待办（Backlog）

> 下列项均已完成（2026-07-31）。真机验证见 §7。

### 8.1 中价值

| ID  | 项                | 端       | 状态   | 说明                                                                                       |
| --- | ----------------- | -------- | ------ | ------------------------------------------------------------------------------------------ |
| M1  | `sharerId` 落库   | 后端为主 | 已完成 | `interaction_shares.sharer_id`；open 回流写入                                              |
| M2  | 分享面板直达好友  | 小程序   | 已完成 | 「微信好友」`button open-type="share"`                                                     |
| M3  | view / share 防刷 | 后端     | 已完成 | Redis 按 IP/用户/题目去重窗口                                                              |

### 8.2 低价值

| ID  | 项                     | 端     | 状态   | 说明                                                                 |
| --- | ---------------------- | ------ | ------ | -------------------------------------------------------------------- |
| L1  | 朋友圈单页模式         | 小程序 | 已完成 | scene=1154 隐藏底栏等重交互                                          |
| L2  | URL Link 失败降级      | 小程序 | 已完成 | 复制 path + 明确 Toast                                               |
| L3  | 评论输入聚焦即提示登录 | 小程序 | 已完成 | `comment_focus`                                                      |
| L4  | 题目级分享封面         | 两端   | 已完成 | 详情 `coverUrl` = 内容首图；前端 `resolveShareImageUrl` 已对接       |

### 8.3 文档与工程债

| ID  | 项                        | 状态   | 说明                                                     |
| --- | ------------------------- | ------ | -------------------------------------------------------- |
| D1  | 历史方案迁入 `docs/tech/` | 已完成 | `2026-07-mobile-admin.md`                                |
| D2  | 本方案文档推送远程        | 已完成 | 以仓库远程为准                                           |

### 8.4 明确不做

- 不要再拆「站内详情要登录 / 分享详情免登」两套规则；已统一为方案 A。

## 9. 关键文件速查（续改入口）

### 小程序

- `utils/questionShare.js` — path / 上报 / 默认封面
- `utils/pendingAction.js` — 登录续做 + Toast 文案
- `utils/router.js` — `ensureLoginForAction` / `openPage`
- `pages/question/detail/index.js` — 分享回调、单页模式、访客态、续做调度
- `pages/question/detail/behaviors/share.js` — 面板、URL Link、降级、举报
- `pages/question/detail/behaviors/comments.js` — 评论门禁与聚焦登录
- `api/request/api_question.js` — `reportShare` / `getShareLink`

### 后端（另一仓库）

- `QuestionRepositoryController` — `/share`、`/share-link`、`/view`
- `ContentQuestionsServiceImpl` — 计次、频控、sharer_id、coverUrl、短链
- `WechatService#generateUrlLink`
- `CreatorInsightsServiceImpl` — share 排序与趋势
- `V1.52__interaction_shares_sharer_id.sql` — 表字段迁移

## 修订记录

| 日期       | 说明                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| 2026-07-31 | 初版：分享闭环、上报、URL Link、方案 A 登录策略落地并归档                    |
| 2026-07-31 | 互动未登录改为轻提示；登录成功后自动续做（pendingAction）                    |
| 2026-07-31 | 高价值体验：访客底栏弱提示、续做成功 Toast、分享卡片默认 imageUrl            |
| 2026-07-31 | 下班手记：补充 §0 跨设备续接 + §8 中/低优先级 backlog（M1–M3、L1–L4、D1–D2） |
| 2026-07-31 | 落地 backlog：sharer 归因、面板直达分享、防刷、单页模式、降级、聚焦登录、coverUrl、文档迁移 |
