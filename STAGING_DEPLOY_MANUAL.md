# 香港 Staging 手动部署指南

**生成时间**: 2026-07-05
**目标服务器**: 43.132.193.205
**部署模式**: ip-http (临时 HTTP 模式，启用真实 Provider)

---

## ⚠️ 重要提醒

SSH 连接当前无法从本地建立。你需要通过**云服务商控制台**或**堡垒机**访问服务器。

---

## 步骤 1：登录服务器

通过云服务商控制台（腾讯云/阿里云/AWS等）的 Web Terminal 登录：
- **服务器 IP**: 43.132.193.205
- **用户名**: ubuntu

---

## 步骤 2：准备部署目录

在服务器上执行：

```bash
# 创建部署目录
sudo mkdir -p /opt/douyin-script
sudo chown ubuntu:ubuntu /opt/douyin-script
cd /opt/douyin-script

# 检查是否已有配置文件
ls -la .env* 2>/dev/null
```

---

## 步骤 3：创建 .env 配置文件

在服务器上创建 `/opt/douyin-script/.env`：

```bash
cd /opt/douyin-script
cat > .env << 'EOF'
# Staging 模式开关
STAGING_ALLOW_IP_HTTP=1
STAGING_ENABLE_REAL_PROVIDERS=1

# PostgreSQL 配置
POSTGRES_DB=douyin_scripts
POSTGRES_USER=app
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
DATABASE_URL=postgresql://app:<URL_ENCODED_POSTGRES_PASSWORD>@db:5432/douyin_scripts?schema=public
EOF

# 设置安全权限
chmod 600 .env
```

---

## 步骤 4：创建 .env.production 配置文件

在服务器上创建 `/opt/douyin-script/.env.production`：

```bash
cd /opt/douyin-script
cat > .env.production << 'EOF'
# 应用配置
NEXT_PUBLIC_APP_NAME=短视频脚本拆写优化网站
NEXT_PUBLIC_APP_URL=http://43.132.193.205
APP_ORIGIN=http://43.132.193.205
SESSION_COOKIE_SECURE=false

# 应用密钥
SESSION_SECRET=<SESSION_SECRET>
ADMIN_MFA_ENCRYPTION_KEY=<ADMIN_MFA_ENCRYPTION_KEY>

# Douyin Provider 配置
DOUYIN_PROVIDER=tikhub

# TikHub 配置
TIKHUB_API_KEY=<TIKHUB_API_KEY>
TIKHUB_API_BASE_URL=https://api.tikhub.io
TIKHUB_REQUEST_TIMEOUT_MS=15000
TIKHUB_RETRY_DELAY_MS=500

# 火山引擎 ASR 配置
VOLCENGINE_ASR_API_KEY=<VOLCENGINE_ASR_API_KEY>
VOLCENGINE_ASR_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_ASR_RESOURCE_ID=doubao-seed-2-0-mini-260428
VOLCENGINE_ASR_REQUEST_TIMEOUT_MS=30000
VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS=30
VOLCENGINE_ASR_QUERY_INTERVAL_MS=3000

# DeepSeek 配置
DEEPSEEK_API_KEY=<DEEPSEEK_API_KEY>
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
AI_REQUEST_TIMEOUT_MS=60000

# Runtime 限制
MAX_DOUYIN_URL_LENGTH=1000
EXTRACTION_JOB_TIMEOUT_MS=300000
EXTRACTION_JOB_TTL_MS=900000
EXTRACTION_WORKER_CONCURRENCY=1
EXTRACTION_MAX_CONCURRENT_PER_USER=2
EXTRACTION_JOB_MAX_ATTEMPTS=3
EXTRACTION_WORKER_POLL_MS=1500
EXTRACTION_LOCK_TIMEOUT_MS=600000

# 成本估算（人民币）
COST_DEEPSEEK_INPUT_CNY_PER_MILLION=1
COST_DEEPSEEK_OUTPUT_CNY_PER_MILLION=2
COST_ASR_CNY_PER_HOUR=8
COST_TIKHUB_CNY_PER_REQUEST=0.01
EOF

# 设置安全权限
chmod 600 .env.production
```

---

## 步骤 5：验证配置文件

```bash
cd /opt/douyin-script

# 检查文件存在和权限
ls -la .env .env.production

# 验证关键配置项（不显示值）
grep -E "^(STAGING_ALLOW_IP_HTTP|STAGING_ENABLE_REAL_PROVIDERS|DOUYIN_PROVIDER|SESSION_COOKIE_SECURE)=" .env .env.production | sed 's/=.*/=***/'
```

预期输出应包含：
- `.env`: `STAGING_ALLOW_IP_HTTP=***`, `STAGING_ENABLE_REAL_PROVIDERS=***`
- `.env.production`: `DOUYIN_PROVIDER=***`, `SESSION_COOKIE_SECURE=***`

---

## 步骤 6：检查 GitHub Actions Runner

确认 self-hosted runner 正在服务器上运行：

```bash
# 方法 1: 检查 runner 服务
sudo systemctl status actions.runner.* | head -20

# 方法 2: 检查 runner 进程
ps aux | grep Runner.Listener
```

如果 runner 未运行，启动它：

```bash
cd /opt/actions-runner
sudo systemctl start actions.runner.*
```

---

## 步骤 7：从本地触发部署

**在你的本地 Mac 执行**：

```bash
cd /Users/douwenkai/Documents/yun\ ying

# 确认当前在 staging 分支
git branch --show-current

# 推送最新代码（如果还没推送）
git push origin staging

# 触发 ip-http 模式部署
gh workflow run deploy.yml \
  --ref staging \
  -f deploy_mode=ip-http

# 等待几秒后查看运行状态
sleep 5
gh run list --workflow=deploy.yml --branch=staging --limit 3

# 实时监控部署进度
gh run watch
```

---

## 步骤 8：部署后验证

### 8.1 检查服务状态

在服务器上执行：

```bash
cd /opt/douyin-script

# 查看容器状态
docker compose ps

# 查看最近日志
docker compose logs --tail=100 web
docker compose logs --tail=100 worker
docker compose logs --tail=50 db
```

### 8.2 健康检查

```bash
# 在服务器上
curl http://localhost/api/health

# 预期响应: {"status":"healthy"}
```

### 8.3 浏览器访问测试

在浏览器中访问：
- **首页**: http://43.132.193.205/
- **登录**: http://43.132.193.205/login
- **管理员登录**: http://43.132.193.205/admin/login

### 8.4 真实提取链路测试

1. 注册新用户或登录
2. 创建一个项目
3. 访问 `/generate` 页面
4. 输入真实抖音分享链接（例如: `https://v.douyin.com/xxxxxx/`）
5. 观察提取流程：
   - TikHub 获取 transcript
   - 如果没有 transcript，使用火山 ASR 提取音频
   - DeepSeek 分析内容
   - 生成最终脚本

---

## 步骤 9：验证真实 Provider 启用

在服务器上验证环境变量：

```bash
cd /opt/douyin-script

# 查看实际加载的配置（已脱敏）
docker compose config | grep -A 2 "DOUYIN_PROVIDER:"
docker compose config | grep -A 2 "TIKHUB_API_BASE_URL:"
docker compose config | grep -A 2 "VOLCENGINE_ASR_ENDPOINT:"
docker compose config | grep -A 2 "DEEPSEEK_API_BASE_URL:"
```

预期看到：
- `DOUYIN_PROVIDER: tikhub`
- TikHub/ASR/DeepSeek 端点正确配置

---

## 故障排查

### 部署失败

查看 GitHub Actions 运行日志：
```bash
# 本地执行
gh run view --log
```

查看服务器部署日志：
```bash
# 服务器上执行
cd /opt/douyin-script
cat deploy.log | tail -100
```

### 服务无法启动

```bash
cd /opt/douyin-script

# 查看详细错误
docker compose logs

# 检查环境变量校验
sh deploy/validate-env.sh
```

### 登录后立即退出（Cookie 问题）

确认 `.env.production` 中：
```bash
grep SESSION_COOKIE_SECURE .env.production
# 必须是: SESSION_COOKIE_SECURE=false
```

如果错误，修改后重新部署：
```bash
# 修改配置
nano .env.production

# 重启服务
docker compose restart web
```

### Provider 调用失败

检查 Worker 日志：
```bash
docker compose logs worker | grep -i "error\|fail"
```

验证 API 密钥格式：
```bash
# 不显示完整值，仅检查是否存在
grep -E "^(TIKHUB_API_KEY|VOLCENGINE_ASR_API_KEY|DEEPSEEK_API_KEY)=" .env.production | wc -l
# 应该输出: 3
```

---

## 紧急回滚

如果部署后出现严重问题：

### 方法 1: 关闭真实 Provider

```bash
cd /opt/douyin-script

# 编辑配置
nano .env.production
# 将 DOUYIN_PROVIDER=tikhub 改为 DOUYIN_PROVIDER=blocked

# 或编辑 .env
nano .env
# 将 STAGING_ENABLE_REAL_PROVIDERS=1 改为 STAGING_ENABLE_REAL_PROVIDERS=0

# 重启服务
docker compose restart web worker
```

### 方法 2: 回滚到上一版本

```bash
cd /opt/douyin-script

# 查看上一次成功的提交
git log --oneline -5

# 回滚到指定提交
sh deploy/self-hosted-deploy.sh <previous-commit-sha>
```

---

## 安全检查清单

完成部署后，确认：

- [x] `.env` 和 `.env.production` 权限为 `600`
- [x] 凭据未提交到 Git 仓库
- [x] 数据库密码已设置（非空）
- [x] SESSION_SECRET 是随机生成的 64 位十六进制
- [x] 服务器防火墙仅开放 80/443 端口
- [x] PostgreSQL 容器仅监听内网（不暴露 5432）
- [x] Web/Worker 容器无宿主端口映射

---

## 下一步计划

部署成功后，继续 P1-19 云端 staging 验收：

1. **EdgeOne 配置**：设置 HTTPS + CDN
2. **COS 备份**：配置 age 加密上传/恢复
3. **安全扫描**：重跑 ZAP、k6 负载测试
4. **完整验收**：独立 Acceptance Agent 验收

---

**配置文件已生成**：
- [.env.staging.template](.env.staging.template)
- [.env.production.staging.template](.env.production.staging.template)

请通过云服务商控制台登录服务器，按照本文档步骤操作。
