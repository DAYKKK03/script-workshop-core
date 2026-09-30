# 基础版环境配置

`.env.example` 只列出配置名称及无密钥示例。实际 `.env` / `.env.local` 不进入 Git。

## 必要配置

- `DATABASE_URL`：新建 PostgreSQL 数据库，禁止复用旧项目数据库。
- `SESSION_SECRET`：至少 32 个随机字符，例如使用 `openssl rand -hex 32` 在本机生成。
- `ADMIN_MFA_ENCRYPTION_KEY`：32 字节随机数据的 Base64；管理员功能使用。
- `ADMIN_RECOVERY_CODE_PEPPER`：管理员恢复码使用的独立随机值。
- `APP_ORIGIN` 和 `NEXT_PUBLIC_APP_URL`：本机开发均为 `http://127.0.0.1:3000`。
- `SESSION_COOKIE_SECURE`：仅本机 HTTP 开发设置 `false`，正式 HTTPS 使用 `true`。
- `SEED_INVITE_CODES`：首次本地注册使用的自定义邀请码；逗号分隔，运行 seed 时读取。

## 外部服务

默认 `DOUYIN_PROVIDER=blocked`。实际提取需要配置既有提取 Provider、火山 ASR 和所需媒体中转；AI 脚本及选题需要 DeepSeek 服务端配置。缺失配置必须明确失败，不能显示假成功。

本仓库不需要声音克隆、对口型或生成音频的环境变量。保留的火山 ASR 是语音转写，属于抖音脚本提取。

## 部署边界

桌面应用在用户电脑上创建本地数据库，不需要云端部署。开发者自行运行源码时应使用独立数据库和自己的服务凭据。
