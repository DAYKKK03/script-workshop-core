# 2026-07-04：ip-http staging 真实 Provider 显式启用方案

## 背景

香港 `ip-http` staging 当前已经可以通过公网 IP 访问，但 `compose.ip-http.yml` 直接把 `DOUYIN_PROVIDER` 硬编码为 `blocked`，导致服务器即使已经安全配置 TikHub、火山 ASR 和 DeepSeek，也无法在该模式下验证真实提取链路。

## 设计目标

1. 默认安全：`ip-http` 模式在未显式授权时仍保持 `DOUYIN_PROVIDER=blocked`。
2. 显式可审计：只有同时满足 `deploy_mode=ip-http`、`.env` 中 `STAGING_ALLOW_IP_HTTP=1` 和新增开关 `STAGING_ENABLE_REAL_PROVIDERS=1` 时，才允许 `DOUYIN_PROVIDER=tikhub`。
3. fail-fast：如果尝试启用真实 Provider，但开关、Provider 值或必要服务端变量缺失，部署前直接失败，只回显变量名，不回显值。
4. 易于止损：把 `STAGING_ENABLE_REAL_PROVIDERS` 改回空值或 `0`，并把 `DOUYIN_PROVIDER` 设回 `blocked` 后重新部署，即可恢复固定失败模式。

## 实现选择

### 为什么不继续在 Compose 里写死 `blocked`

- 写死后会覆盖 `.env.production`，运维即使已经正确配置真实 Provider，也无法开启链路。
- 这会让 `ip-http` 模式只能验证登录和页面，无法验证真实提取、ASR 和生成，和当前 staging 目标冲突。

### 为什么把开关收口到 `deploy/validate-env.sh`

- `env_file` 已经负责把服务端变量注入 Web/Worker，真正的问题是“什么情况下允许注入真实 Provider 配置”。
- 部署前脚本最适合做模式边界和 fail-fast 校验，不需要改业务代码，也不会把密钥写进 Compose。
- 这样可以同时保证默认安全和运维可控，不靠 URL、`NODE_ENV` 或“发现密钥存在”做隐式推断。

## 能做到什么

- `ip-http` 模式可继续作为默认 `blocked` 的临时可信测试环境。
- 在服务器明确授权后，`ip-http` 模式可让 Web/Worker 使用 `.env.production` 中的真实 TikHub、火山 ASR 和 DeepSeek 配置。
- 部署前能明确指出缺失的变量名，避免上线后才发现链路根本不可用。

## 做不到什么

- 这不是正式生产方案，仍然没有 TLS，也不替代正式域名、HTTPS 和 EdgeOne 回源校验。
- 不会自动验证第三方密钥是否正确，也不会在本地调用真实 TikHub/ASR/DeepSeek。
- 不会把 `ip-http` 变成“任何配置都能自动猜到该开真 Provider”的宽松模式。

## 变量边界

### 始终需要

- `STAGING_ALLOW_IP_HTTP=1`
- `SESSION_COOKIE_SECURE=false`
- `EXTRACTION_WORKER_CONCURRENCY=1`

### 启用真实 Provider 时额外需要

- `STAGING_ENABLE_REAL_PROVIDERS=1`
- `DOUYIN_PROVIDER=tikhub`
- `TIKHUB_API_KEY`
- `TIKHUB_API_BASE_URL`
- `VOLCENGINE_ASR_API_KEY`
- `VOLCENGINE_ASR_ENDPOINT` 或 `VOLCENGINE_ASR_SUBMIT_ENDPOINT`
- `VOLCENGINE_ASR_RESOURCE_ID`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_API_BASE_URL`
- `DEEPSEEK_MODEL`

## 止损边界

如果 staging 出现费用、合规或稳定性风险，按以下顺序恢复：

1. `.env.production` 中把 `DOUYIN_PROVIDER` 改回 `blocked`
2. `.env` 中把 `STAGING_ENABLE_REAL_PROVIDERS` 清空或设为 `0`
3. 重新部署 `deploy_mode=ip-http`

完成后页面会回到固定失败提示路径，不会再调用真实外部 Provider。
