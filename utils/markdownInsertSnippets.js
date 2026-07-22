/** Markdown 工具栏：插入片段与模板文案 */

export function getMarkdownSnippet(type) {
  switch (type) {
    case 'h1':
      return { text: '\n\n# 一级标题\n\n这里是标题内容...', name: '一级标题' };
    case 'h2':
      return { text: '\n\n## 二级标题\n\n这里是二级标题内容...', name: '二级标题' };
    case 'h3':
      return { text: '\n\n### 三级标题\n\n这里是三级标题内容...', name: '三级标题' };
    case 'bold':
      return { text: '\n\n**这里是粗体文字**', name: '粗体文字' };
    case 'italic':
      return { text: '\n\n*这里是斜体文字*', name: '斜体文字' };
    case 'list':
      return { text: '\n\n- 列表项一\n- 列表项二\n- 列表项三', name: '无序列表' };
    case 'ordered-list':
      return { text: '\n\n1. 列表项一\n2. 列表项二\n3. 列表项三', name: '有序列表' };
    case 'quote':
      return {
        text: '\n\n> 这里是引用内容\n> 可以多行显示引用内容',
        name: '引用块',
      };
    case 'inline-code':
      return { text: '\n\n`这里是行内代码`', name: '行内代码' };
    case 'code':
      return {
        text: '\n\n```javascript\n// 这里是代码块\nfunction example() {\n  console.log("Hello World");\n}\n```',
        name: '代码块',
      };
    case 'link':
      return { text: '\n\n[链接文字](https://example.com)', name: '超链接' };
    case 'table':
      return {
        text: '\n\n| 标题1 | 标题2 | 标题3 |\n|-------|-------|-------|\n| 内容1 | 内容2 | 内容3 |\n| 内容4 | 内容5 | 内容6 |',
        name: '表格',
      };
    case 'divider':
      return { text: '\n\n---\n\n', name: '分割线' };
    case 'checklist':
      return {
        text: '\n\n- [ ] 任务项一\n- [ ] 任务项二\n- [x] 已完成任务',
        name: '任务列表',
      };
    case 'formula':
      return {
        text: '\n\n$$\ne^{i\\pi} + 1 = 0\n$$\n\n这是一个数学公式示例。',
        name: '数学公式',
      };
    case 'mermaid':
      return {
        text: '\n\n```mermaid\ngraph TD\n    A[开始] --> B(处理)\n    B --> C{判断}\n    C -->|是| D[结束]\n    C -->|否| B\n```',
        name: '流程图',
      };
    default:
      return null;
  }
}

export function getMarkdownTemplate(type) {
  switch (type) {
    case 'tutorial':
      return {
        name: '教程模板',
        text: "\n\n# 使用教程模板\n\n## 概述\n\n在这里描述您的产品/技术的背景和目的...\n\n## 安装步骤\n\n### 1. 环境准备\n\n确保您的系统满足以下要求：\n\n- Node.js 14.0 或更高版本\n- npm 6.0 或更高版本\n\n### 2. 安装命令\n\n```bash\nnpm install your-package --save\n```\n\n## 快速开始\n\n### 基本配置\n\n1. 导入模块\n2. 初始化配置\n3. 开始使用\n\n### 示例代码\n\n```javascript\nconst yourModule = require('your-package');\n\n// 初始化\nconst instance = yourModule.init({\n  apiKey: 'your-api-key',\n  endpoint: 'https://api.example.com'\n});\n\n// 使用功能\ninstance.doSomething();\n```\n\n## 注意事项\n\n> 重要提示：在生产环境使用前，请确保充分测试。\n\n## 常见问题\n\n**Q: 如何解决常见错误？**\nA: 检查网络连接和配置参数。\n\n**Q: 如何获取支持？**\nA: 请访问我们的官方文档或联系技术支持。",
      };
    case 'api':
      return {
        name: 'API文档模板',
        text: '\n\n# API 文档模板\n\n## 接口概览\n\n| 接口名称 | 请求方法 | 接口路径 | 描述 | 认证要求 |\n|----------|----------|----------|------|----------|\n| 获取用户 | GET | /api/users | 获取用户列表 | 需要token |\n| 创建用户 | POST | /api/users | 创建新用户 | 需要token |\n| 用户详情 | GET | /api/users/:id | 获取用户详情 | 需要token |\n| 更新用户 | PUT | /api/users/:id | 更新用户信息 | 需要token |\n| 删除用户 | DELETE | /api/users/:id | 删除用户 | 需要token |\n\n## 通用说明\n\n### 请求头\n\n```http\nAuthorization: Bearer {token}\nContent-Type: application/json\nAccept: application/json\n```\n\n### 请求示例\n\n```bash\ncurl -X GET \\\n  "https://api.example.com/users" \\\n  -H "Authorization: Bearer your-token-here" \\\n  -H "Content-Type: application/json"\n```\n\n### 响应格式\n\n所有响应都遵循以下格式：\n\n```json\n{\n  "code": 200,\n  "data": {},\n  "message": "success",\n  "timestamp": 1640995200000\n}\n```\n\n### 参数说明\n\n| 参数名 | 类型 | 必填 | 说明 | 示例 |\n|--------|------|------|------|------|\n| page   | number | 否 | 页码，从1开始 | 1 |\n| size   | number | 否 | 每页数量，默认20 | 20 |\n| sort   | string | 否 | 排序字段 | "createdAt:desc" |\n\n### 错误码\n\n| 错误码 | 说明 |\n|--------|------|\n| 400 | 请求参数错误 |\n| 401 | 未授权 |\n| 403 | 权限不足 |\n| 404 | 资源不存在 |\n| 500 | 服务器内部错误 |',
      };
    case 'code':
      return {
        name: '代码模板',
        text: "\n\n```javascript\n// 代码模板\n\n/**\n * 函数名称\n * @param {string} param1 - 参数1描述\n * @param {number} param2 - 参数2描述\n * @returns {boolean} 返回值描述\n * @example\n * // 示例用法\n * const result = functionName('hello', 123);\n */\nfunction functionName(param1, param2) {\n  // 函数实现\n  console.log(`参数1: ${param1}, 参数2: ${param2}`);\n  \n  // 返回结果\n  return true;\n}\n\n// 使用示例\nconst example = functionName('test', 456);\nconsole.log('执行结果:', example);\n```",
      };
    case 'table':
      return {
        name: '表格模板',
        text: '\n\n| 参数名 | 类型 | 必填 | 默认值 | 说明 | 示例 |\n|--------|------|------|--------|------|------|\n| id     | string | 是 | 无 | 唯一标识 | "user_123" |\n| name   | string | 是 | 无 | 用户姓名 | "张三" |\n| age    | number | 否 | 18 | 用户年龄 | 25 |\n| email  | string | 是 | 无 | 用户邮箱 | "user@example.com" |\n| status | string | 否 | "active" | 用户状态 | "active", "inactive" |\n| createdAt | string | 否 | 无 | 创建时间 | "2024-01-23T10:30:00Z" |\n| updatedAt | string | 否 | 无 | 更新时间 | "2024-01-23T11:00:00Z" |',
      };
    default:
      return null;
  }
}
