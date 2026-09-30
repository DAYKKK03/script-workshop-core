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

本仓库另提供无需另装 Docker、Node.js、PostgreSQL 的桌面应用构建。原项目正在实施的专用本机 Compose 未纳入该快照。源码初验见 [CORE_EDITION_VERIFICATION.md](docs/CORE_EDITION_VERIFICATION.md)，桌面发行验收以对应 Release 的记录为准。原有部署记录仅为来源项目历史。

## 普通用户安装

从本仓库的 [Releases](https://github.com/DAYKKK03/script-workshop-core/releases) 下载与电脑匹配的应用包。打开后先保存自己的 DeepSeek、TikHub、火山引擎等服务参数，再点击「启动应用」。启动器自动建立独立的本地数据库并启动三个后台任务；首次注册使用配置页显示的邀请码。关闭应用后数据仍保存在本机，下次打开可以继续使用。没有配置的外部服务保持不可用状态，应用不会提供模拟结果。

应用和数据库只监听本机回环地址。注册、登录和商家项目不需要用户另装数据库；AI 生成、抖音提取及语音转写依赖对应服务和网络。发行包未经签名或公证时，操作系统可能显示未知开发者提示；以 Release 页面披露的实际签名状态为准。

当前源码中的桌面应用构建方式见下文；只有在 Release 页面实际出现并标明验证状态的包才视为可下载交付。

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
npm run desktop:prepare
npm run test:desktop
```

`desktop:prepare` 生成可供打包的 Next standalone、迁移和后台任务文件。开发者可运行 `npx electron-builder --dir --mac --arm64`（或对应平台参数）制作未签名应用目录；正式安装包由 [桌面构建工作流](.github/workflows/desktop-packages.yml) 分平台构建并上传校验和。桌面端运行测试使用随包 PostgreSQL 和临时目录，无需 Docker，结束后清除测试数据。

数据库集成测试使用独立的 `TEST_DATABASE_URL`，不得与 `DATABASE_URL` 指向同一数据库。没有测试数据库或 staging 配置时，相应测试会明确跳过。GitHub CI 提供隔离 PostgreSQL 执行数据库测试。

## 配置与发布

所有密钥只放服务端环境文件或部署 Secret。GitHub 仅保存源码、无密钥模板、文档及测试。`deploy.yml` 仅保留手动触发；上传代码不会部署原项目服务器。

产品契约见 [PRD](docs/PRD.md)、[爆款选题设计](docs/TOPIC_IDEAS_DESIGN_SPEC.md)、[定制化脚本设计](docs/CUSTOM_SCRIPT_DESIGN_SPEC.md)。
