# ARCHITECTURE.md

## 架构目标

第一版目标是跑通抖音脚本拆写 MVP，不做大而全 SaaS。

系统必须支持用户注册登录、邀请码控制、商家项目资料维护、抖音链接口播自动提取、参考脚本结构拆解、按时长生成完整脚本、复制结果。

## 总体架构

```text
Frontend Pages
↓
API Routes
↓
Auth / Permission Guard
↓
Business Services
↓
Providers
↓
Database
```

## 分层说明

### Frontend Pages

职责：页面展示、表单输入、流程状态展示、复制按钮、错误提示。

禁止：

- 不在前端写 AI Prompt。
- 不在前端调用 AI Key。
- 不在前端调用第三方密钥接口。
- 不在前端做用户权限判断的最终依据。

### API Routes

职责：登录鉴权、参数校验、调用 service、返回统一响应格式、屏蔽内部错误细节。

### Services

核心 service：

```text
authService
inviteCodeService
projectService
douyinTranscriptService
referenceAnalysisService
scriptGenerationService
```

### Providers

Provider 用来隔离外部服务：

```text
douyinTranscriptProvider
aiProvider
```

原则：外部接口不可用时，不影响项目其他部分启动；Provider 必须返回标准化结果；Provider 不允许把第三方错误堆栈直接透出给用户。

### Database

持久化数据：User、InviteCode、Project。

不持久化数据：当前抖音链接、自动提取文案、参考结构、生成文案。这些属于页面内 ScriptDraft Session，第一版不做长期历史记录。

## 新脚本生成流程

```text
用户选择 Project
↓
读取 Project.profileText 最新值
↓
用户输入 Douyin URL
↓
校验 Douyin URL
↓
调用 douyinTranscriptProvider 提取口播文案
↓
失败则返回固定错误提示
↓
成功则展示 originalTranscript
↓
调用 referenceAnalysisService
↓
输出结构名称 + 原文片段
↓
用户选择脚本时长
↓
调用 scriptGenerationService
↓
生成完整新口播脚本
↓
前端展示复制按钮
```

## 错误处理

### 抖音链接错误

用户提示固定为：

```text
当前链接无法自动提取，请更换可提取的抖音视频链接
```

内部可以记录 URL 校验失败、Provider 失败、无口播内容、第三方接口失败、超时，但不能把内部错误直接展示给用户。

### AI 输出错误

如果 AI 返回结构不合法：

1. 后端尝试修复或重试一次。
2. 仍失败时返回用户可理解的错误。
3. 不允许返回半成品结构。
4. 不允许伪造拆解结果。

## 权限规则

1. 未登录不能访问工作台、项目和生成页面。
2. 用户只能读写自己的 Project。
3. InviteCode 只能被使用一次。
4. disabled 邀请码不能使用。
5. 所有需要用户身份的 API 必须从服务端 session 中读取 userId，不能信任前端传入的 userId。

## 状态管理

持久状态：用户账号、邀请码状态、商家项目资料。

页面临时状态：当前抖音链接、原口播文案、参考拆解结构、当前时长选择、生成脚本文案。

页面刷新或离开后，不保证保留。
