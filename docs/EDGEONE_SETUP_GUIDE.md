# EdgeOne CDN + HTTPS 完整配置指南

**更新时间**：2026-07-05
**目标**：从当前 IP HTTP 临时模式切换到正式 EdgeOne CDN + HTTPS 模式

---

## 📋 配置总览

### 当前状态
- ✅ 服务器：43.132.193.205（香港）
- ✅ 访问方式：HTTP（`ip-http` 临时模式）
- ✅ 真实 Provider：已启用（TikHub + 火山 ASR + DeepSeek）

### 目标状态
- 🎯 域名：`your-domain.top`（购买后替换）
- 🎯 访问方式：HTTPS（通过 EdgeOne CDN）
- 🎯 安全防护：WAF + Bot/CC 防护 + 回源校验

---

## 第一步：购买域名（腾讯云）

### 1.1 最便宜域名推荐

| 域名后缀 | 首年价格 | 续费价格 | 推荐指数 |
|---------|---------|---------|---------|
| `.top` | ¥8-10 | ¥35-40 | ⭐⭐⭐⭐⭐（最推荐）|
| `.site` | ¥10-12 | ¥88-128 | ⭐⭐⭐（续费贵）|
| `.xyz` | ¥8-10 | ¥68-78 | ⭐⭐⭐（续费贵）|
| `.cc` | ¥28-38 | ¥58-68 | ⭐⭐⭐⭐ |

**推荐选择**：`.top` 域名（首年 ¥8-10，续费 ¥35-40，性价比最高）

### 1.2 购买步骤

#### 步骤 1：访问腾讯云域名注册页面
- 网址：https://dnspod.cloud.tencent.com/
- 使用你的腾讯云账号登录

#### 步骤 2：搜索并选择域名
1. 在搜索框输入你想要的域名（如 `myapp`）
2. 选择 `.top` 后缀
3. 点击"查询"检查是否可注册
4. 如果可用，点击"加入购物车"

#### 步骤 3：完成购买
1. 点击"去结算"
2. 选择购买年限（建议先买 1 年）
3. 勾选"域名信息模板"（首次需要创建）
4. 点击"提交订单"
5. 完成支付（微信/支付宝）

#### 步骤 4：实名认证（必须）
1. 购买后进入"我的域名"
2. 找到刚购买的域名，点击"实名认证"
3. 上传身份证正反面照片
4. 填写个人信息
5. 提交审核（通常 1-2 小时完成）

**⚠️ 注意**：实名认证通过前，域名无法使用！

### 1.3 DNS 解析配置

实名认证通过后，配置 DNS 解析：

1. 进入"域名管理"→"解析"
2. **暂时不添加任何记录**（稍后 EdgeOne 会自动配置）
3. 记下你的域名（如 `myapp.top`），后续需要用到

---

## 第二步：创建 EdgeOne 站点

### 2.1 访问 EdgeOne 控制台

- 网址：https://console.cloud.tencent.com/edgeone
- 使用腾讯云账号登录

### 2.2 创建站点

#### 步骤 1：添加站点
1. 点击"添加站点"
2. 输入你的域名（如 `myapp.top`）
3. 选择"DNS 接入"
4. 点击"继续"

#### 步骤 2：选择套餐
1. 选择"免费版"（足够使用）
2. 点击"确定"

#### 步骤 3：修改域名 NS 服务器
EdgeOne 会显示 2 个 NS 服务器地址，如：
```
ns1.tencent-cloud.net
ns2.tencent-cloud.net
```

返回域名管理页面：
1. 找到你的域名，点击"管理"
2. 进入"域名信息"
3. 点击"修改 DNS 服务器"
4. 将默认 DNS 改为 EdgeOne 提供的 2 个 NS 地址
5. 保存（生效需要 0-72 小时，通常几分钟即可）

#### 步骤 4：等待站点激活
- 返回 EdgeOne 控制台
- 等待站点状态变为"已激活"（绿色）
- 通常 5-30 分钟内激活

---

## 第三步：配置 EdgeOne

### 3.1 SSL 证书配置

1. 进入站点详情 → "HTTPS 配置" → "证书管理"
2. 点击"申请免费证书"
3. 选择"托管证书"
4. 域名选择你的主域名（如 `myapp.top`）
5. 点击"提交"
6. 等待证书颁发（通常 5-10 分钟）

### 3.2 回源配置

#### 步骤 1：配置源站
1. 进入"源站管理"
2. 点击"添加源站"
3. 填写：
   - **源站类型**：IPv4
   - **源站地址**：`43.132.193.205`
   - **端口**：`80`
4. 点击"确定"

#### 步骤 2：配置回源 Host
1. 进入"回源配置" → "回源 Host"
2. 点击"添加规则"
3. 填写：
   - **匹配类型**：全部请求
   - **回源 Host**：你的域名（如 `myapp.top`）
4. 点击"确定"

#### 步骤 3：配置回源验证头（重要！）
1. 进入"回源配置" → "回源请求头"
2. 点击"添加规则"
3. 填写：
   - **匹配类型**：全部请求
   - **操作**：设置
   - **请求头名称**：`X-EdgeOne-Origin-Verify`
   - **请求头值**：生成随机密钥（见下方脚本）
   - **覆盖客户端请求头**：✅ 勾选
4. 点击"确定"

**生成随机密钥**（在你的 Mac 终端执行）：
```bash
openssl rand -hex 32
```
输出示例：`a1b2c3d4e5f6...`（64 位十六进制字符）

**⚠️ 重要**：记下这个密钥，稍后需要配置到服务器！

### 3.3 缓存配置

1. 进入"缓存配置" → "节点缓存 TTL"
2. 添加以下规则：

**规则 1：不缓存 API**
- **匹配类型**：URL 路径
- **匹配内容**：`/api/*`
- **缓存 TTL**：不缓存

**规则 2：不缓存管理后台**
- **匹配类型**：URL 路径
- **匹配内容**：`/admin*`
- **缓存 TTL**：不缓存

**规则 3：缓存静态资源**
- **匹配类型**：URL 路径
- **匹配内容**：`/_next/static/*`
- **缓存 TTL**：7 天

### 3.4 WAF 配置

1. 进入"安全防护" → "Web 防护"
2. 开启"托管规则"
3. 威胁等级选择"中等"
4. 开启"Bot 管理"
5. 开启"CC 防护"

### 3.5 频率限制（后台保护）

1. 进入"安全防护" → "速率限制"
2. 添加规则：
   - **规则名称**：Admin 路径保护
   - **匹配条件**：URL 路径以 `/admin` 开头
   - **阈值**：60 秒内最多 100 次请求
   - **动作**：返回验证码
3. 点击"确定"

### 3.6 HTTPS 强制跳转

1. 进入"规则引擎"
2. 添加规则：
   - **规则名称**：强制 HTTPS
   - **匹配条件**：协议为 HTTP
   - **动作**：重定向
   - **目标协议**：HTTPS
   - **状态码**：301
3. 点击"确定"

---

## 第四步：配置服务器

### 4.1 生成配置脚本

在你的 Mac 终端执行以下命令，生成服务器配置脚本：

```bash
cd /Users/douwenkai/Documents/yun\ ying

# 生成随机 EDGEONE_ORIGIN_SECRET
ORIGIN_SECRET=$(openssl rand -hex 32)

# 创建服务器配置脚本
cat > /tmp/update_server_config.sh << EOF
#!/bin/bash
# 服务器配置更新脚本 - 从 ip-http 切换到 standard 模式

cd /opt/douyin-script

echo "=== 备份现有配置 ==="
cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
cp .env.production .env.production.backup.\$(date +%Y%m%d_%H%M%S)
echo "✓ 配置已备份"

echo ""
echo "=== 更新 .env（Compose 配置）==="
cat > .env << 'ENV_EOF'
# PostgreSQL 配置
POSTGRES_DB=douyin_scripts
POSTGRES_USER=app
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
DATABASE_URL=postgresql://app:<URL_ENCODED_POSTGRES_PASSWORD>@db:5432/douyin_scripts?schema=public

# Docker 镜像
APP_IMAGE=ghcr.io/daykkk03/xinmeiti

# 域名和 EdgeOne（⚠️ 请替换为你的实际域名和密钥）
APP_DOMAIN=YOUR_DOMAIN_HERE
EDGEONE_ORIGIN_SECRET=<EDGEONE_ORIGIN_SECRET>

# ⚠️ 移除临时模式标记
# STAGING_ALLOW_IP_HTTP=1
# STAGING_ENABLE_REAL_PROVIDERS=1
ENV_EOF

chmod 600 .env
echo "✓ .env 已更新"

echo ""
echo "=== 更新 .env.production（应用配置）==="
cat > .env.production << 'PROD_EOF'
# Application
NEXT_PUBLIC_APP_NAME=短视频脚本拆写优化网站
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN_HERE
APP_ORIGIN=https://YOUR_DOMAIN_HERE
SESSION_COOKIE_SECURE=true

# Database
DATABASE_URL=postgresql://app:<URL_ENCODED_POSTGRES_PASSWORD>@db:5432/douyin_scripts?schema=public

# Session & Admin
SESSION_SECRET=<SESSION_SECRET>
ADMIN_MFA_ENCRYPTION_KEY=<ADMIN_MFA_ENCRYPTION_KEY>

# Provider
DOUYIN_PROVIDER=tikhub

# TikHub
TIKHUB_API_KEY=<TIKHUB_API_KEY>
TIKHUB_API_BASE_URL=https://api.tikhub.io
TIKHUB_REQUEST_TIMEOUT_MS=15000
TIKHUB_RETRY_DELAY_MS=500

# Volcengine ASR
VOLCENGINE_ASR_API_KEY=<VOLCENGINE_ASR_API_KEY>
VOLCENGINE_ASR_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_ASR_RESOURCE_ID=doubao-seed-2-0-mini-260428
VOLCENGINE_ASR_REQUEST_TIMEOUT_MS=30000
VOLCENGINE_ASR_QUERY_MAX_ATTEMPTS=30
VOLCENGINE_ASR_QUERY_INTERVAL_MS=3000

# DeepSeek
DEEPSEEK_API_KEY=<DEEPSEEK_API_KEY>
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
AI_REQUEST_TIMEOUT_MS=60000

# Runtime limits
MAX_DOUYIN_URL_LENGTH=1000
EXTRACTION_JOB_TIMEOUT_MS=300000
EXTRACTION_JOB_TTL_MS=900000
EXTRACTION_WORKER_CONCURRENCY=1
EXTRACTION_MAX_CONCURRENT_PER_USER=2
EXTRACTION_JOB_MAX_ATTEMPTS=3
EXTRACTION_WORKER_POLL_MS=1500
EXTRACTION_LOCK_TIMEOUT_MS=600000

# Cost
COST_DEEPSEEK_INPUT_CNY_PER_MILLION=1
COST_DEEPSEEK_OUTPUT_CNY_PER_MILLION=2
COST_ASR_CNY_PER_HOUR=8
COST_TIKHUB_CNY_PER_REQUEST=0.01
PROD_EOF

chmod 600 .env.production
echo "✓ .env.production 已更新"

echo ""
echo "=== 验证配置 ==="
echo "APP_DOMAIN:"
grep "^APP_DOMAIN=" .env
echo ""
echo "EDGEONE_ORIGIN_SECRET:"
grep "^EDGEONE_ORIGIN_SECRET=" .env | sed 's/=.*/=***/'
echo ""
echo "SESSION_COOKIE_SECURE:"
grep "^SESSION_COOKIE_SECURE=" .env.production

echo ""
echo "======================================"
echo "✅ 配置更新完成！"
echo "======================================"
echo ""
echo "⚠️ 重要提醒："
echo "1. 请将配置中的 YOUR_DOMAIN_HERE 替换为你的实际域名"
echo "2. 确保 EdgeOne 中的 X-EdgeOne-Origin-Verify 值与 EDGEONE_ORIGIN_SECRET 一致"
echo "3. 配置完成后需要重新部署"
EOF

chmod +x /tmp/update_server_config.sh

echo ""
echo "✅ 配置脚本已生成"
echo ""
echo "生成的 EDGEONE_ORIGIN_SECRET:"
echo "$ORIGIN_SECRET"
echo ""
echo "⚠️ 重要：请记下这个密钥，需要在 EdgeOne 中配置！"
echo ""
echo "下一步："
echo "1. 将 /tmp/update_server_config.sh 的内容复制到服务器"
echo "2. 将脚本中的 YOUR_DOMAIN_HERE 替换为你的实际域名"
echo "3. 在服务器上执行脚本"
```

### 4.2 在服务器上执行配置

**将上面生成的脚本内容复制到服务器并执行**：

1. 登录香港服务器（通过云服务商控制台）
2. 创建脚本文件：
```bash
cd /opt/douyin-script
nano update_config.sh
```

3. 粘贴脚本内容（记得替换 `YOUR_DOMAIN_HERE` 为你的实际域名）

4. 执行脚本：
```bash
chmod +x update_config.sh
./update_config.sh
```

5. 停止当前容器：
```bash
docker compose down
```

---

## 第五步：部署到 HTTPS 模式

### 5.1 从本地触发部署

在你的 Mac 终端执行：

```bash
cd /Users/douwenkai/Documents/yun\ ying

# 确认在 staging 分支
git branch --show-current

# 触发 standard 模式部署（不再使用 ip-http）
gh workflow run deploy.yml --ref staging

# 监控部署进度
gh run watch
```

### 5.2 等待部署完成

部署通常需要 3-5 分钟。成功后：
- Web/Worker/DB 容器启动
- 数据库 migration 执行
- 健康检查通过

---

## 第六步：验证配置

### 6.1 验证 EdgeOne 回源保护

**直连源站 IP 应返回 403**：

```bash
# 从你的 Mac 执行
curl -I http://43.132.193.205/

# 预期输出：403 Forbidden
```

这证明 Caddy 正确阻止了非 EdgeOne 的访问。

### 6.2 验证 HTTPS 访问

**通过域名访问应成功**：

```bash
curl -I https://your-domain.top/

# 预期输出：200 OK 或 301/302 重定向
```

### 6.3 验证健康检查

```bash
curl https://your-domain.top/api/health

# 预期输出：{"status":"ok"}
```

### 6.4 浏览器验证

1. 访问 `https://your-domain.top/`
2. 检查是否自动跳转到 HTTPS
3. 检查浏览器地址栏是否显示🔒锁图标
4. 尝试登录/注册
5. 检查 Cookie 是否正常保存（Secure Cookie）

### 6.5 验证管理后台

1. 访问 `https://your-domain.top/admin/login`
2. 使用管理员账号登录
3. 检查 TOTP 二次验证
4. 进入后台查看系统状态

---

## 故障排查

### 问题 1：直连 IP 没有返回 403

**原因**：`EDGEONE_ORIGIN_SECRET` 配置错误

**解决**：
1. 检查服务器 `.env` 中的 `EDGEONE_ORIGIN_SECRET`
2. 检查 EdgeOne 中的 `X-EdgeOne-Origin-Verify` 值
3. 确保两者完全一致
4. 重新部署

### 问题 2：登录后立即退出

**原因**：Cookie Secure 配置问题

**解决**：
1. 检查 `.env.production` 中 `SESSION_COOKIE_SECURE=true`
2. 确保访问地址是 HTTPS（不是 HTTP）
3. 清除浏览器 Cookie 后重试

### 问题 3：域名无法访问

**原因**：DNS 未生效或 EdgeOne 未激活

**解决**：
1. 检查域名 NS 是否已修改为 EdgeOne 提供的值
2. 等待 DNS 生效（最长 72 小时）
3. 检查 EdgeOne 站点状态是否为"已激活"

### 问题 4：SSL 证书错误

**原因**：证书未颁发或配置错误

**解决**：
1. 进入 EdgeOne → HTTPS 配置 → 证书管理
2. 检查证书状态
3. 如果失败，重新申请托管证书

---

## 总成本估算

| 项目 | 首年费用 | 年度费用 |
|-----|---------|---------|
| `.top` 域名 | ¥8-10 | ¥35-40 |
| EdgeOne 免费版 | ¥0 | ¥0 |
| SSL 托管证书 | ¥0 | ¥0 |
| **总计** | **¥8-10** | **¥35-40** |

---

## 下一步计划

EdgeOne 配置完成后，继续 P1-19 剩余工作：

1. ✅ EdgeOne CDN + HTTPS 配置（本文档）
2. ⏳ COS 加密备份/恢复配置
3. ⏳ 完整烟雾测试
4. ⏳ k6 负载测试
5. ⏳ ZAP 安全扫描
6. ⏳ 独立 Acceptance Agent 验收

---

**配置完成后，请通知产品经理，我会安排验收 Agent 进行全面验收。**
