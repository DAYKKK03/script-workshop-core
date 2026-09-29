# 脚本工坊基础版

面向本地生活商家的短视频内容工作台。本仓库是独立保存的无数字人版本。

## 保留功能

- 账号、密码和邀请码注册登录，商家项目归属隔离。
- 商家项目创建、查看、编辑、删除；使用一个大文本框维护资料。
- 抖音口播提取、参考结构拆解、按所选时长生成新脚本及复制。
- 爆款选题：25 宫格选题与 Top 3 优先拍方向。
- 定制化脚本：根据商家最新资料、自由需求或选题生成口播。
- 必要的管理员后台、额度、限流、异步任务和审计能力。

不包含数字人入口、声音克隆、对口型、生成音频清理及其数据表。抖音转写依赖的火山 ASR、媒体中转仍保留。

## 来源与交付状态

基于 [DAYKKK03/xinmeiti](https://github.com/DAYKKK03/xinmeiti) 提交 `b35380ca7e879c06c2b792bb0c94ac750862f46f`，于 2026-09-29 独立导出并建立新的提交历史。原项目和其中的数字人开发代码不受影响。

本次交付为源码保存，不包含网站部署、旧数据库恢复或真实外部服务验收。原项目正在实施的专用本机 Compose 尚未纳入该快照。验证结果见 [CORE_EDITION_VERIFICATION.md](docs/CORE_EDITION_VERIFICATION.md)。原有部署记录仅为来源项目历史。

## 开发运行

需要 Node.js 22、npm 和 PostgreSQL 16。使用全新数据库，不把该精简迁移链直接套用到原项目数据库。

```sh
git clone https://github.com/DAYKKK03/script-workshop-core.git
cd script-workshop-core
npm ci
cp .env.example .env
```

按照 [环境配置](docs/ENVIRONMENT.md) 填写本地数据库连接、随机会话密钥和本机 Origin；保持 `DOUYIN_PROVIDER=blocked`、AI/ASR/COS 等密钥为空。环境文件不可提交。

可使用 `npm run db:up` 启动独立开发用 PostgreSQL；它使用 `compose.dev.yml` 的固定开发凭据和本机 5432 端口，只适合开发。如果端口已占用，改用自己的空白开发数据库并配置 `DATABASE_URL`。

```sh
npx prisma generate
npm run db:deploy
npm run db:seed
npm run dev -- --hostname 127.0.0.1
```

首次使用先在 `.env` 的 `SEED_INVITE_CODES` 中设置本地邀请码，再执行 seed，使用邀请码注册。页面地址为 `http://127.0.0.1:3000`。

异步处理需要另开终端，分别启动：

```sh
npm run worker
npm run worker:topics
npm run worker:custom-scripts
```

缺少外部服务配置时，相关生成操作明确返回不可用。运行页面不等于具备真实提取和生成能力。

## 验证

```sh
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run build
```

数据库集成测试使用独立的 `TEST_DATABASE_URL`，不得与 `DATABASE_URL` 指向同一数据库。没有测试数据库或 staging 配置时，相应测试会明确跳过。GitHub CI 提供隔离 PostgreSQL 执行数据库测试。

## 配置与发布

所有密钥只放服务端环境文件或部署 Secret。GitHub 仅保存源码、无密钥模板、文档及测试。`deploy.yml` 仅保留手动触发；上传代码不会部署原项目服务器。

产品契约见 [PRD](docs/PRD.md)、[爆款选题设计](docs/TOPIC_IDEAS_DESIGN_SPEC.md)、[定制化脚本设计](docs/CUSTOM_SCRIPT_DESIGN_SPEC.md)。
