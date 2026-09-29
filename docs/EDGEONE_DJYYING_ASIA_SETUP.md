# EdgeOne CDN + HTTPS 配置指南（djyying.asia）

**域名**：`djyying.asia`
**回源密钥**：`<EDGEONE_ORIGIN_SECRET>`
**生成时间**：2026-07-05

---

## 📋 配置步骤

### 第一步：创建 EdgeOne 站点

#### 1.1 访问 EdgeOne 控制台
https://console.cloud.tencent.com/edgeone

#### 1.2 添加站点
1. 点击 **"添加站点"**
2. 输入域名：`djyying.asia`
3. 选择 **"DNS 接入"**
4. 点击 **"继续"**

#### 1.3 选择套餐
1. 选择 **"免费版"**
2. 点击 **"确定"**

#### 1.4 修改域名 NS 服务器
EdgeOne 会显示 2 个 NS 服务器地址，例如：
```
ns1.edgeone-dns.com
ns2.edgeone-dns.com
```

**修改 DNS：**
1. 访问腾讯云域名控制台：https://console.cloud.tencent.com/domain
2. 找到 `djyying.asia`，点击 **"管理"**
3. 进入 **"基本信息"** → **"DNS 服务器"**
4. 点击 **"修改"**
5. 将默认 DNS 改为 EdgeOne 提供的 2 个 NS 地址
6. 点击 **"确定"**

**等待生效：**通常 5-30 分钟

#### 1.5 等待站点激活
- 返回 EdgeOne 控制台
- 等待站点状态变为 **"已激活"**（绿色）

---

### 第二步：配置 SSL 证书

站点激活后：

1. 进入站点详情 → **"HTTPS 配置"** → **"证书管理"**
2. 点击 **"申请免费证书"**
3. 选择 **"托管证书"**
4. 域名选择：`djyying.asia`
5. 点击 **"提交"**
6. 等待证书颁发（5-10 分钟）

---

### 第三步：配置回源

#### 3.1 添加源站
1. 进入 **"源站管理"**
2. 点击 **"添加源站"**
3. 配置：
   - **源站类型**：`IPv4`
   - **源站地址**：`43.132.193.205`
   - **端口**：`80`
4. 点击 **"确定"**

#### 3.2 配置回源 Host
1. 进入 **"回源配置"** → **"回源 Host"**
2. 点击 **"添加规则"**
3. 配置：
   - **匹配类型**：全部请求
   - **回源 Host**：`djyying.asia`
4. 点击 **"确定"**

#### 3.3 配置回源验证头（重要！）
1. 进入 **"回源配置"** → **"回源请求头"**
2. 点击 **"添加规则"**
3. 配置：
   - **匹配类型**：全部请求
   - **操作**：设置
   - **请求头名称**：`X-EdgeOne-Origin-Verify`
   - **请求头值**：`<EDGEONE_ORIGIN_SECRET>`
   - **覆盖客户端请求头**：✅ **必须勾选**
4. 点击 **"确定"**

**⚠️ 超级重要**：请求头值必须完全一致！

---

### 第四步：配置缓存规则

1. 进入 **"缓存配置"** → **"节点缓存 TTL"**

#### 规则 1：不缓存 API
- 点击 **"添加规则"**
- **匹配类型**：URL 路径
- **匹配内容**：`/api/*`
- **缓存 TTL**：不缓存

#### 规则 2：不缓存管理后台
- 点击 **"添加规则"**
- **匹配类型**：URL 路径
- **匹配内容**：`/admin*`
- **缓存 TTL**：不缓存

#### 规则 3：缓存静态资源
- 点击 **"添加规则"**
- **匹配类型**：URL 路径
- **匹配内容**：`/_next/static/*`
- **缓存 TTL**：7 天

---

### 第五步：配置安全防护

#### 5.1 启用 WAF
1. 进入 **"安全防护"** → **"Web 防护"**
2. 开启 **"托管规则"**
3. 威胁等级选择 **"中等"**

#### 5.2 启用 Bot/CC 防护
1. 在同一页面，开启 **"Bot 管理"**
2. 开启 **"CC 防护"**

#### 5.3 后台路径保护
1. 进入 **"安全防护"** → **"速率限制"**
2. 点击 **"添加规则"**
3. 配置：
   - **规则名称**：Admin 路径保护
   - **匹配条件**：URL 路径 以 `/admin` 开头
   - **阈值**：60 秒内最多 100 次请求
   - **动作**：返回验证码

---

### 第六步：强制 HTTPS

1. 进入 **"规则引擎"**
2. 点击 **"添加规则"**
3. 配置：
   - **规则名称**：强制 HTTPS
   - **匹配条件**：协议 等于 HTTP
   - **执行动作**：重定向
   - **目标 URL**：`https://$host$uri`
   - **状态码**：301

---

### 第七步：配置服务器

EdgeOne 配置完成后，在服务器上执行：

```bash
cd /opt/douyin-script

# 备份现有配置
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
cp .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S)

# 更新 .env
cat > .env << 'ENV_EOF'
POSTGRES_DB=douyin_scripts
POSTGRES_USER=app
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
DATABASE_URL=postgresql://app:<URL_ENCODED_POSTGRES_PASSWORD>@db:5432/douyin_scripts?schema=public
APP_IMAGE=ghcr.io/daykkk03/xinmeiti
APP_DOMAIN=djyying.asia
EDGEONE_ORIGIN_SECRET=<EDGEONE_ORIGIN_SECRET>
ENV_EOF

chmod 600 .env

# 更新 .env.production
cat > .env.production << 'PROD_EOF'
NEXT_PUBLIC_APP_NAME=短视频脚本拆写优化网站
NEXT_PUBLIC_APP_URL=https://djyying.asia
APP_ORIGIN=https://djyying.asia
SESSION_COOKIE_SECURE=true
DATABASE_URL=postgresql://app:<URL_ENCODED_POSTGRES_PASSWORD>@db:5432/douyin_scripts?schema=public
SESSION_SECRET=<SESSION_SECRET>
ADMIN_MFA_ENCRYPTION_KEY=<ADMIN_MFA_ENCRYPTION_KEY>
DOUYIN_PROVIDER=tikhub
TIKHUB_API_KEY=<TIKHUB_API_KEY>
TIKHUB_API_BASE_URL=https://api.tikhub.io
TIKHUB_REQUEST_TIMEOUT_MS=15000
TIKHUB_RETRY_DELAY_MS=500
VOLCENGINE_ASR_API_KEY=<VOLCENGINE_ASR_API_KEY>
VOLCENGINE_ASR_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_ASR_RESOURCE_ID=doubao-seed-2-0-mini-260428
VOLCENGINE_ASR_REQUEST_TIMEOUT_MS=30000
VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS=30
VOLCENGINE_ASR_QUERY_INTERVAL_MS=3000
DEEPSEEK_API_KEY=<DEEPSEEK_API_KEY>
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
AI_REQUEST_TIMEOUT_MS=60000
MAX_DOUYIN_URL_LENGTH=1000
EXTRACTION_JOB_TIMEOUT_MS=300000
EXTRACTION_JOB_TTL_MS=900000
EXTRACTION_WORKER_CONCURRENCY=1
EXTRACTION_MAX_CONCURRENT_PER_USER=2
EXTRACTION_JOB_MAX_ATTEMPTS=3
EXTRACTION_WORKER_POLL_MS=1500
EXTRACTION_LOCK_TIMEOUT_MS=600000
COST_DEEPSEEK_INPUT_CNY_PER_MILLION=1
COST_DEEPSEEK_OUTPUT_CNY_PER_MILLION=2
COST_ASR_CNY_PER_HOUR=8
COST_TIKHUB_CNY_PER_REQUEST=0.01
PROD_EOF

chmod 600 .env.production

# 停止容器
docker compose down

echo ""
echo "✅ 服务器配置完成！"
echo ""
echo "现在从本地 Mac 触发部署..."
```

---

### 第八步：从 Mac 触发部署

EdgeOne 配置 + 服务器配置都完成后，在你的 Mac 终端执行：

```bash
cd /Users/douwenkai/Documents/yun\ ying

# 触发 standard 模式部署
gh workflow run deploy.yml --ref staging

# 监控部署
gh run watch
```

部署需要 3-5 分钟。

---

### 第九步：验证配置

#### 9.1 验证回源保护（直连 IP 应返回 403）
```bash
curl -I http://43.132.193.205/
```
**预期**：`403 Forbidden`

#### 9.2 验证 HTTPS 访问
```bash
curl -I https://djyying.asia/
```
**预期**：`200 OK` 或重定向

#### 9.3 验证健康检查
```bash
curl https://djyying.asia/api/health
```
**预期**：`{"status":"ok"}`

#### 9.4 浏览器验证
1. 访问 `https://djyying.asia/`
2. 检查🔒锁图标
3. 尝试注册/登录
4. 测试抖音链接提取

---

## 📝 关键配置汇总

| 项目 | 值 |
|-----|-----|
| **域名** | `djyying.asia` |
| **源站 IP** | `43.132.193.205` |
| **回源端口** | `80` |
| **回源 Host** | `djyying.asia` |
| **回源验证头** | `X-EdgeOne-Origin-Verify` |
| **验证头值** | `<EDGEONE_ORIGIN_SECRET>` |
| **HTTPS URL** | `https://djyying.asia/` |

---

## ⏱️ 预计时间

| 步骤 | 时间 |
|------|------|
| EdgeOne 站点激活 | 5-30 分钟 |
| SSL 证书申请 | 5-10 分钟 |
| EdgeOne 配置 | 15-20 分钟 |
| 服务器配置 | 2 分钟 |
| 部署 | 3-5 分钟 |
| **总计** | **约 30-60 分钟** |

---

## 🎯 开始配置！

**按照上面的步骤，一步步完成 EdgeOne 配置。**

有任何问题随时告诉我！
