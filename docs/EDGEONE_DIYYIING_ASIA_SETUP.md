# EdgeOne + HTTPS 配置指南（diyyiing.asia）

**域名**：`diyyiing.asia`
**生成时间**：2026-07-05
**EdgeOne 回源密钥**：`<EDGEONE_ORIGIN_SECRET>`

---

## ⏰ 当前状态

- ✅ 域名已购买：`diyyiing.asia`
- ⏳ **实名认证审核中**（等待 1-2 小时）
- ⏳ EdgeOne 配置（实名通过后开始）
- ✅ 服务器配置脚本已生成

---

## 📋 完整流程

### 阶段 1：等待实名认证通过 ⏳

**你需要做的**：
1. 定期检查腾讯云域名控制台
2. 看到域名状态变为"正常"即可进入下一步

**预计时间**：1-2 小时（最快 5-10 分钟）

---

### 阶段 2：配置 EdgeOne CDN

实名认证通过后，立即执行以下步骤：

#### 步骤 1：访问 EdgeOne 控制台

网址：https://console.cloud.tencent.com/edgeone

#### 步骤 2：创建站点

1. 点击**"添加站点"**
2. 输入域名：`diyyiing.asia`
3. 选择**"DNS 接入"**
4. 点击**"继续"**

#### 步骤 3：选择套餐

1. 选择**"免费版"**
2. 点击**"确定"**

#### 步骤 4：修改域名 NS 服务器

EdgeOne 会显示 2 个 NS 服务器地址，类似：
```
ns1.edgeone-dns.com
ns2.edgeone-dns.com
```

**修改域名 DNS**：
1. 返回腾讯云域名控制台（https://console.cloud.tencent.com/domain）
2. 找到 `diyyiing.asia`，点击**"管理"**
3. 进入**"基本信息"**
4. 找到**"DNS 服务器"**，点击**"修改"**
5. 将默认 DNS 改为 EdgeOne 提供的 2 个 NS 地址
6. 点击**"确定"**
7. 等待 DNS 生效（通常 5-30 分钟）

#### 步骤 5：等待站点激活

1. 返回 EdgeOne 控制台
2. 等待站点状态变为**"已激活"**（绿色）
3. 通常 5-30 分钟内激活

---

### 阶段 3：配置 SSL 证书

站点激活后，配置 HTTPS：

1. 进入站点详情 → **"HTTPS 配置"** → **"证书管理"**
2. 点击**"申请免费证书"**
3. 选择**"托管证书"**
4. 域名选择：`diyyiing.asia`
5. 点击**"提交"**
6. 等待证书颁发（5-10 分钟）

---

### 阶段 4：配置回源

#### 4.1 添加源站

1. 进入**"源站管理"**
2. 点击**"添加源站"**
3. 配置：
   - **源站类型**：`IPv4`
   - **源站地址**：`43.132.193.205`
   - **端口**：`80`
4. 点击**"确定"**

#### 4.2 配置回源 Host

1. 进入**"回源配置"** → **"回源 Host"**
2. 点击**"添加规则"**
3. 配置：
   - **匹配类型**：全部请求
   - **回源 Host**：`diyyiing.asia`
4. 点击**"确定"**

#### 4.3 配置回源验证头（关键！）

1. 进入**"回源配置"** → **"回源请求头"**
2. 点击**"添加规则"**
3. 配置：
   - **匹配类型**：全部请求
   - **操作**：设置
   - **请求头名称**：`X-EdgeOne-Origin-Verify`
   - **请求头值**：`<EDGEONE_ORIGIN_SECRET>`
   - **覆盖客户端请求头**：✅ **必须勾选**
4. 点击**"确定"**

**⚠️ 超级重要**：
- 请求头值必须与服务器配置的 `EDGEONE_ORIGIN_SECRET` 完全一致
- 必须勾选"覆盖客户端请求头"，否则安全防护失效

---

### 阶段 5：配置缓存规则

1. 进入**"缓存配置"** → **"节点缓存 TTL"**

#### 规则 1：不缓存 API
- 点击**"添加规则"**
- **匹配类型**：URL 路径
- **匹配内容**：`/api/*`
- **缓存 TTL**：不缓存
- 点击**"确定"**

#### 规则 2：不缓存管理后台
- 点击**"添加规则"**
- **匹配类型**：URL 路径
- **匹配内容**：`/admin*`
- **缓存 TTL**：不缓存
- 点击**"确定"**

#### 规则 3：缓存静态资源
- 点击**"添加规则"**
- **匹配类型**：URL 路径
- **匹配内容**：`/_next/static/*`
- **缓存 TTL**：7 天
- 点击**"确定"**

---

### 阶段 6：配置安全防护

#### 6.1 启用 WAF

1. 进入**"安全防护"** → **"Web 防护"**
2. 开启**"托管规则"**
3. 威胁等级选择**"中等"**
4. 点击**"保存"**

#### 6.2 启用 Bot 防护

1. 在同一页面，开启**"Bot 管理"**
2. 点击**"保存"**

#### 6.3 启用 CC 防护

1. 在同一页面，开启**"CC 防护"**
2. 点击**"保存"**

#### 6.4 后台路径频率限制

1. 进入**"安全防护"** → **"速率限制"**
2. 点击**"添加规则"**
3. 配置：
   - **规则名称**：Admin 路径保护
   - **匹配条件**：URL 路径 以 `/admin` 开头
   - **阈值**：60 秒内最多 100 次请求
   - **动作**：返回验证码
4. 点击**"确定"**

---

### 阶段 7：配置 HTTPS 强制跳转

1. 进入**"规则引擎"**
2. 点击**"添加规则"**
3. 配置：
   - **规则名称**：强制 HTTPS
   - **匹配条件**：协议 等于 HTTP
   - **执行动作**：重定向
   - **目标 URL**：`https://$host$uri`
   - **状态码**：301
4. 点击**"确定"**

---

### 阶段 8：配置服务器

EdgeOne 全部配置完成后，在服务器上执行：

#### 在服务器控制台执行

登录香港服务器（43.132.193.205），执行以下命令：

```bash
# 创建配置脚本
cat > /opt/douyin-script/update_edgeone_config.sh << 'SCRIPT_EOF'
#!/bin/bash
cd /opt/douyin-script

echo "========================================="
echo "EdgeOne HTTPS 模式配置"
echo "域名: diyyiing.asia"
echo "========================================="

echo ""
echo "=== 备份现有配置 ==="
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
cp .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ 配置已备份"

echo ""
echo "=== 更新 .env ==="
cat > .env << 'ENV_EOF'
POSTGRES_DB=douyin_scripts
POSTGRES_USER=app
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
DATABASE_URL=postgresql://app:<URL_ENCODED_POSTGRES_PASSWORD>@db:5432/douyin_scripts?schema=public
APP_IMAGE=ghcr.io/daykkk03/xinmeiti
APP_DOMAIN=diyyiing.asia
EDGEONE_ORIGIN_SECRET=<EDGEONE_ORIGIN_SECRET>
ENV_EOF
chmod 600 .env
echo "✓ .env 已更新"

echo ""
echo "=== 更新 .env.production ==="
cat > .env.production << 'PROD_EOF'
NEXT_PUBLIC_APP_NAME=短视频脚本拆写优化网站
NEXT_PUBLIC_APP_URL=https://diyyiing.asia
APP_ORIGIN=https://diyyiing.asia
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
echo "✓ .env.production 已更新"

echo ""
echo "=== 停止当前容器 ==="
docker compose down
echo "✓ 容器已停止"

echo ""
echo "======================================"
echo "✅ 服务器配置完成！"
echo "======================================"
SCRIPT_EOF

chmod +x /opt/douyin-script/update_edgeone_config.sh
/opt/douyin-script/update_edgeone_config.sh
```

---

### 阶段 9：触发 GitHub Actions 部署

服务器配置完成后，**在你的 Mac 终端**执行：

```bash
cd /Users/douwenkai/Documents/yun\ ying

# 触发 standard 模式部署（不再是 ip-http）
gh workflow run deploy.yml --ref staging

# 监控部署进度
gh run watch
```

部署需要 3-5 分钟。

---

### 阶段 10：验证部署

#### 10.1 验证回源保护（直连 IP 应返回 403）

```bash
curl -I http://43.132.193.205/
```

**预期输出**：`403 Forbidden`

这证明 Caddy 正确阻止了非 EdgeOne 的访问。

#### 10.2 验证 HTTPS 访问

```bash
curl -I https://diyyiing.asia/
```

**预期输出**：`200 OK` 或 `301/302`

#### 10.3 验证健康检查

```bash
curl https://diyyiing.asia/api/health
```

**预期输出**：`{"status":"ok"}`

#### 10.4 浏览器验证

1. 访问 `https://diyyiing.asia/`
2. 检查地址栏🔒锁图标
3. 尝试注册/登录
4. 测试抖音链接提取

---

## 📝 关键配置参数汇总

| 项目 | 值 |
|-----|-----|
| **域名** | `diyyiing.asia` |
| **源站 IP** | `43.132.193.205` |
| **回源端口** | `80` |
| **回源 Host** | `diyyiing.asia` |
| **回源验证头** | `X-EdgeOne-Origin-Verify` |
| **验证头值** | `<EDGEONE_ORIGIN_SECRET>` |
| **HTTPS URL** | `https://diyyiing.asia/` |
| **Cookie Secure** | `true` |

---

## ⏱️ 时间估算

| 阶段 | 预计时间 |
|------|---------|
| 实名认证 | 1-2 小时 |
| EdgeOne 站点创建 | 5-30 分钟 |
| SSL 证书申请 | 5-10 分钟 |
| EdgeOne 配置 | 15-20 分钟 |
| 服务器配置 | 2 分钟 |
| 部署 | 3-5 分钟 |
| **总计** | **约 2-3 小时** |

---

## 🎯 完成后

EdgeOne + HTTPS 配置完成后，我会安排**验收 Agent**进行全面验收：

1. ✅ 回源保护验证
2. ✅ HTTPS 功能验证
3. ✅ 登录/Cookie 验证
4. ✅ 真实链接提取测试
5. ✅ WAF/CC 防护验证
6. ✅ 性能和安全测试

---

**现在请等待实名认证通过，通过后按照本文档逐步操作即可！**
