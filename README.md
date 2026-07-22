# 面试题库小程序

微信小程序：按分类刷题、发布/管理文档、积分与个人中心等能力。UI 基于 [TDesign 小程序](https://tdesign.tencent.com/miniprogram/overview)。

## 功能概览

- **题库**：一级/二级分类、职业 scope、题目列表与详情
- **刷题 / 知识**：`mknow` 等学习相关页面
- **发布**：Markdown 编辑与文档发布、审核与积分
- **个人中心**：资料、关注/粉丝/访客、积分、设置等

## 目录结构（简要）

```text
├── api/              # 请求封装与各业务 API
├── behaviors/        # 多页复用 Behavior（编辑器、级联分类、Toast 等）
├── components/       # 公共组件
├── config/           # 环境配置（dev / test / prod）
├── custom-tab-bar/   # 自定义 TabBar
├── pages/            # 页面（主包 + 分包）
│   └── xxx/behaviors/  # 单页专用逻辑（就近放置，不进根 behaviors/）
├── utils/            # 纯函数工具（无 this）
└── app.js / app.json
```

**Behavior 约定：** 仅被一个页面使用的放 `pages/<页>/behaviors/`；被 ≥2 个页面共用的放根目录 `behaviors/`。

## 本地开发

```bash
npm install
```

1. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)导入本仓库根目录
2. 工具栏：**工具 → 构建 npm**
3. 开发环境 API 见 `config/dev.js`；体验版 / 正式版见 `config/test.js`、`config/prod.js`（上线前需改成真实域名）

最低基础库建议与 `project.config.json` 中 `libVersion` 对齐（当前约 `3.x`）。

## 代码规范

```bash
npm run lint          # ESLint 检查
npm run lint:fix     # ESLint + Prettier 修复（会改文件，提交前慎用全仓）
```

提交前 husky 会通过 `lint-staged` **只处理暂存文件**，不会全仓格式化。

## License

MIT
