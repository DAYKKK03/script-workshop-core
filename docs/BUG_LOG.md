> 以下为来源项目的历史记录，不代表基础版当前部署或验收状态。当前交付范围见 README.md；本次拆分验证见 docs/CORE_EDITION_VERIFICATION.md。

# Bug 修复记录

## 用途

本文件是项目统一的 Bug 台账。发现新问题后先新增记录，再持续更新调查、修复和验证结果；已关闭的问题保留，不删除历史。

记录中不得包含真实 Key、数据库密码、完整媒体 URL、完整 transcript、完整生成文案或第三方接口原始响应。

## 状态说明

| 状态 | 含义 |
| --- | --- |
| `OPEN` | 已确认问题，尚未开始调查 |
| `INVESTIGATING` | 正在定位原因 |
| `FIXING` | 正在修改 |
| `VERIFYING` | 已修改，等待或正在验证 |
| `FIXED` | 已验证修复 |
| `BLOCKED` | 因外部条件暂时无法继续 |
| `EXTERNAL_RESOLVED` | 外部服务问题已恢复，无需修改代码 |

## 严重程度

| 等级 | 标准 |
| --- | --- |
| `S0` | 安全事故、数据泄露或全站不可用 |
| `S1` | 核心流程不可用，且没有可行替代路径 |
| `S2` | 主要功能异常，但影响范围有限或可以重试 |
| `S3` | 一般体验、文案或低风险问题 |

## 问题索引

| 编号 | 标题 | 严重程度 | 状态 | 最近更新 |
| --- | --- | --- | --- | --- |
| `BUG-20260627-001` | 完整抖音分享文案无法识别链接 | S2 | FIXED | 2026-06-27 |
| `BUG-20260627-002` | 切换项目或时长会重复提取口播 | S2 | FIXED | 2026-06-27 |
| `BUG-20260627-003` | 提取服务因额度不足返回失败 | S1 | EXTERNAL_RESOLVED | 2026-06-27 |
| `BUG-20260627-004` | 视频信息获取成功后语音转写仍失败 | S1 | FIXED | 2026-06-27 |
| `BUG-20260627-005` | 独立音轨静音时未回退视频原声 | S1 | FIXED | 2026-06-27 |
| `BUG-20260704-001` | IP HTTP staging 登录成功后会话丢失并闪回登录页 | S1 | FIXED | 2026-07-04 |
| `BUG-20260704-002` | IP HTTP staging 无法显式启用真实 Provider | S1 | FIXED | 2026-07-04 |
| `BUG-20260706-001` | 临时管理员接口与本地部署文档存在凭据暴露风险 | S0 | FIXED | 2026-07-06 |
| `BUG-20260707-001` | staging 抖音链接提取在 TikHub 阶段统一失败 | S1 | INVESTIGATING | 2026-07-07 |
| `BUG-20260707-002` | EdgeOne 域名入口持续 308，业务规则未命中 | S1 | FIXED | 2026-07-08 |
| `BUG-20260708-001` | 管理员登录恢复被无效 MFA 加密密钥阻断 | S1 | FIXED | 2026-07-08 |
| `BUG-20260708-002` | 新 OWNER 初始化脚本在 standalone 镜像内缺失 | S2 | FIXED | 2026-07-08 |
| `BUG-20260708-003` | 后台邀请码列表只能看到脱敏码，无法复制已生成完整邀请码 | S2 | OPEN | 2026-07-08 |
| `BUG-20260708-004` | 生成页当前样本再次显示“当前链接无法自动提取” | S1 | FIXING | 2026-07-08 |
| `BUG-20260711-001` | DeepSeek analyze-reference API POST 在 staging 出现网络失败 | S1 | BLOCKED | 2026-07-11 |
| `BUG-20260713-001` | TikHub 标题文本绕过 ASR 直接作为原口播 | S1 | FIXED | 2026-07-13 |
| `BUG-20260714-001` | 定制化脚本第二轮从零重写导致短稿退化 | S1 | VERIFYING | 2026-07-14 |
| `BUG-20260714-002` | 24句数组契约能否稳定满足完整脚本校验尚无真实证据 | S2 | INVESTIGATING | 2026-07-14 |
| `BUG-20260714-003` | 24句探针仍依赖模型一次性命中总长度 | S2 | INVESTIGATING | 2026-07-14 |
| `BUG-20260714-004` | 索引扩写探针的完整replacement协议触发24条原样回显 | S2 | VERIFYING | 2026-07-14 |
| `BUG-20260714-005` | 索引前缀探针可用非法24项和空子集错误通过gate | S1 | VERIFYING | 2026-07-14 |
| `BUG-20260714-006` | 自由文本前缀仍可新增非数字商业事实并产生重复口播 | S1 | VERIFYING | 2026-07-14 |
| `BUG-20260715-001` | prefixId探针日志仍暴露精确计数分布 | S2 | VERIFYING | 2026-07-15 |
| `BUG-20260715-002` | prefixId选择器在大规模无解候选上搜索成本失控 | S2 | VERIFYING | 2026-07-15 |
| `BUG-20260715-003` | prefixId候选偏好顺序被误作安全门禁 | S2 | VERIFYING | 2026-07-15 |

## 详细记录

### BUG-20260627-001：完整抖音分享文案无法识别链接

- **发现日期**：2026-06-27
- **严重程度**：S2
- **状态**：FIXED
- **影响范围**：生成页的抖音来源输入。
- **现象**：输入框只接受纯网址，直接粘贴抖音完整分享文案时校验失败。
- **原因**：前后端把整个输入值当成 URL 校验，没有先从分享文案中提取抖音链接。
- **修复**：增加统一的抖音来源解析逻辑，从完整分享文案中选择第一个有效抖音链接，并继续兼容纯网址。
- **验证**：链接解析、状态管理及请求重试相关自动化测试共 11 项通过；类型检查、代码检查和生产构建通过。
- **后续事项**：无。

### BUG-20260627-002：切换项目或时长会重复提取口播

- **发现日期**：2026-06-27
- **严重程度**：S2
- **状态**：FIXED
- **影响范围**：生成页的项目切换、脚本时长切换和重新生成流程。
- **现象**：已经提取参考口播后，切换商家项目、商家资料或脚本时长会重新提取；生成后也不便直接换条件重新生成。
- **原因**：页面没有区分“抖音来源状态”和“生成条件状态”，条件变化会清空整条流程。
- **修复**：只有抖音来源变化时才清空并重新提取；项目、最新商家资料或时长变化只清空新脚本结果，保留参考口播和结构拆解。
- **验证**：状态转换自动化测试通过，完整测试、类型检查、代码检查和生产构建通过。
- **后续事项**：无。

### BUG-20260627-003：提取服务因额度不足返回失败

- **发现日期**：2026-06-27
- **严重程度**：S1
- **状态**：EXTERNAL_RESOLVED
- **影响范围**：抖音视频信息提取。
- **现象**：有效抖音来源仍显示无法自动提取。
- **原因**：外部提取服务账户额度不足，接口返回付费状态错误。
- **处理**：账户充值后复测，外部提取接口已恢复成功响应。
- **验证**：使用脱敏测试请求确认外部提取接口返回成功，不记录完整地址或原始响应。
- **后续事项**：后续应增加余额和付费状态的后台监控，但不得向前端暴露供应商或账户信息。

### BUG-20260627-004：视频信息获取成功后语音转写仍失败

- **发现日期**：2026-06-27
- **严重程度**：S1
- **状态**：FIXED
- **影响范围**：抖音口播自动提取核心流程。
- **现象**：外部视频信息获取成功，但任务约两分钟后以语音转写失败结束，页面显示固定提取失败提示。
- **当前判断**：已确认故障位于媒体选择与 ASR 输入边界。TikHub 同时返回独立音轨和视频播放地址，现有解析顺序优先选择视频；该视频地址没有扩展名，实际响应类型为 MP4，ASR 请求却按默认 MP3 格式提交，任务持续处于处理中。
- **已完成排查**：确认提取服务额度已恢复；确认最近失败任务耗时约 119 秒且只保留通用错误码；同一脱敏来源按默认 30 次轮询在约 96 秒后仍为处理中，诊断性 60 次轮询在约 186 秒内均为处理中；安全媒体元数据确认视频资源约 36.6 MB，而同一响应存在约 3.2 MB 的独立 MP3 音轨。
- **原因**：TikHub 同时返回独立音轨和视频播放地址，但旧解析顺序优先选择视频。该视频地址没有扩展名，实际类型为 MP4，ASR 请求却按默认 MP3 格式提交，导致供应商持续返回处理中；同时错误分类在 Provider 边界被折叠成通用错误码。
- **修复**：Provider 优先选择明确独立音轨并携带媒体格式；视频回退路径明确使用 MP4。ASR 新增提交失败、查询请求失败、查询超时、供应商拒绝及无可用音轨等安全错误码，ExtractionJob 只保存这些分类，不保存第三方原始响应或敏感正文。页面仍只返回固定失败提示。
- **验证**：新增测试先确认 8 项相关行为失败，再完成 8/8 绿测；全量 19 项测试通过。同一脱敏来源旧视频路径在 186 秒、60 次查询后仍处于处理中，修复后独立 MP3 音轨在 20 秒、7 次查询内转写成功。生产模式临时 ExtractionJob 在 32 秒内成功，读取后数据库未保留完整来源或 transcript；无效来源仍返回固定提示；临时数据已清理。代码检查、类型检查和生产构建通过。
- **后续事项**：生产环境仍需监控各安全错误码分布；任务队列和多实例 worker 风险继续由 P1-17 后续阶段处理。
- **验收标准**：可明确区分转写超时、请求失败、供应商拒绝和无可用音轨；可提取的视频稳定返回口播，不可提取的视频仍显示 PRD 规定的固定错误提示。

### BUG-20260627-005：独立音轨静音时未回退视频原声

- **发现日期**：2026-06-27
- **严重程度**：S1
- **状态**：FIXED
- **影响范围**：同时提供独立音乐音轨和视频播放资源的抖音来源。
- **现象**：链接和视频信息获取正常，但任务约 13 至 15 秒后失败，页面显示固定提取失败提示。
- **原因**：上一轮修复默认优先使用独立音轨。当前样本的独立音轨被 ASR 明确判定为静音，但视频原声包含有效口播；系统没有在静音状态下回退视频资源，并把静音状态归入通用供应商拒绝。
- **修复**：保留音轨和视频两个候选资源；将供应商静音状态归类为 `ASR_NO_AUDIO_TRACK`；仅在首选音轨无可用声音时回退一次 MP4 视频原声，其他错误不盲目重试。
- **验证**：三项新增回归行为先失败后通过。使用同一脱敏来源验证，独立音轨返回静音状态，视频原声回退在 6 次查询后成功并得到非空转写；未记录完整来源、媒体地址或转写正文。
- **后续事项**：继续观察不同视频类型的音轨质量；视频回退会比独立音轨处理更慢，但仍受现有任务超时边界约束。

### BUG-20260704-001：IP HTTP staging 登录成功后会话丢失并闪回登录页

- **发现日期**：2026-07-04
- **严重程度**：S1
- **状态**：FIXED
- **影响范围**：无域名公网 IP 临时 staging 的管理员登录和普通用户登录。
- **现象**：登录接口返回成功后页面短暂进入目标页，但马上被送回登录页。
- **原因**：旧实现仅根据 `NODE_ENV=production` 决定 `Secure` Cookie。临时 IP HTTP staging 仍使用 production 构建，浏览器会拒绝在纯 HTTP 下保存 `Secure` 会话 Cookie，导致管理员和普通用户都丢失会话。
- **修复**：新增显式服务端配置 `SESSION_COOKIE_SECURE`，默认安全回退为 `true`；只有通过 `deploy_mode=ip-http` 校验的临时模式才允许设为 `false`。管理员、普通用户、登录、注册和注销统一复用同一套 Cookie 策略。
- **验证**：先新增 `.env.example` 显式配置入口测试并确认红灯；补齐配置示例后，管理员/普通用户 Cookie 策略测试、部署模式错配测试、self-hosted deploy 配置测试均通过。随后 `npm test`、`npm run lint`、`npm run typecheck`、`npm run build`、`npx prisma validate` 全部通过。当前自动化结果为 105 tests：91 pass、14 skip、0 fail；skip 项均为缺少隔离 staging/数据库环境的既有门控测试。
- **后续事项**：香港服务器重新部署临时 IP HTTP 模式时，必须同步设置 `SESSION_COOKIE_SECURE=false` 并按文档复测登录。

### BUG-20260704-002：IP HTTP staging 无法显式启用真实 Provider

- **发现日期**：2026-07-04
- **严重程度**：S1
- **状态**：FIXED
- **影响范围**：香港 `ip-http` staging 的真实抖音提取、ASR 和生成联调。
- **现象**：即使服务器已经安全配置真实 TikHub、火山 ASR 和 DeepSeek，页面提取仍固定失败。
- **原因**：`compose.ip-http.yml` 在 Web 和 Worker 上硬编码 `DOUYIN_PROVIDER=blocked`，覆盖了 `.env.production`；部署前校验也没有提供“显式授权后启用真实 Provider”的受控路径。
- **修复**：移除 `ip-http` Compose 对 `DOUYIN_PROVIDER` 的硬覆盖，把启用边界收口到 `deploy/validate-env.sh`。默认仍保持 `blocked`；只有 `.env` 同时满足 `STAGING_ALLOW_IP_HTTP=1` 和 `STAGING_ENABLE_REAL_PROVIDERS=1`，且 `.env.production` 明确设置 `DOUYIN_PROVIDER=tikhub` 并补齐 TikHub、火山 ASR、DeepSeek 所需变量时，部署前校验才允许真实 Provider 进入容器。
- **验证**：先补部署配置红测，证明旧实现下 `compose.ip-http.yml` 仍强制 `blocked`、授权开关未生效、缺少真实 Provider 变量也不会失败；修复后定向部署配置测试转绿，覆盖默认 blocked、显式授权启用 tikhub、授权缺失/非法 Provider/缺少必要变量 fail-fast、标准模式不受影响。
- **后续事项**：香港服务器要真正启用真实 Provider，仍需由运维在 `.env` / `.env.production` 手工填写变量名对应值，并按 `deploy_mode=ip-http` 重新部署；正式生产仍必须回到域名 + HTTPS + EdgeOne 模式。

### BUG-20260706-001：临时管理员接口与本地部署文档存在凭据暴露风险

- **发现日期**：2026-07-06
- **严重程度**：S0
- **状态**：FIXED
- **影响范围**：staging 安全边界、本地部署文档、项目工作日志。
- **现象**：仓库曾出现临时 `bootstrap-admin` API 路由；同时若干本地部署说明和工作日志保留了真实部署凭据形态。
- **原因**：为抢通 staging 运维链路引入了短期初始化手段和手工部署笔记，但缺少“只能走服务端 bootstrap 脚本、不得把密钥写入仓库文档/日志”的最后一道收口。
- **修复**：确认仓库不再保留 `app/api/bootstrap-admin/route.ts`，管理员初始化只保留受控的服务端 `scripts/bootstrap-admin.ts` / `lib/admin/bootstrap.ts` 路径；针对 `STAGING_DEPLOY_MANUAL.md`、EdgeOne 配置文档和 `project-team/work-log.md` 做占位符脱敏；新增安全回归测试，阻止临时管理员 API 回归和文档再写入真实凭据形态。
- **验证**：P1-20 安全回归测试先失败后通过；后续执行 `npm test`、`npm run lint`、`npm run typecheck`、`npm run build` 作为整体验证。修复记录和状态文档不包含真实密钥。
- **后续事项**：代码仓库已止血，但服务器与供应商侧旧密钥仍应按应急流程轮换，包括数据库密码、Session Secret、管理员 MFA 加密密钥、TikHub、火山 ASR、DeepSeek、EdgeOne 回源密钥，以及任何可能复制到本地文档的部署口令。

### BUG-20260707-001：staging 抖音链接提取在 TikHub 阶段统一失败

- **发现日期**：2026-07-07
- **严重程度**：S1
- **状态**：INVESTIGATING
- **影响范围**：staging 生成页的抖音口播自动提取链路。
- **现象**：用户在页面输入抖音分享链接后，页面返回固定失败提示 `当前链接无法自动提取，请更换可提取的抖音视频链接`。
- **复现条件**：入口层与登录已恢复正常，真实 Provider 已显式启用。
- **当前判断**：最新 staging 复现已确认 `create job -> worker claim` 都成功，当前真实阻断落在 TikHub 请求层：`provider=tikhub / errorCode=TIKHUB_PROVIDER_REQUEST_FAILED / failureCategory=request / httpStatus=404 / retryable=false / attempts=1`，且没有进入 ASR / DeepSeek。
- **已知证据**：早期样本曾出现 `queued / attemptCount=0`，但 P1-21.2C / P1-21.2D / P1-21.2E 的同一样本四事件关联已经证明 worker 可以消费同一 job；同时 TikHub 官方文档确认当前代码使用的 `GET /api/v1/douyin/web/fetch_one_video_by_share_url?share_url=...` 契约本身正确，重点可疑点转为 staging 仍沿用旧部署文档中的 `TIKHUB_API_BASE_URL=https://mcp.tikhub.io` 而非官方 `https://api.tikhub.io`。
- **修复**：P1-21.2F 将在不改前端和用户文案的前提下，只修 TikHub 请求层和重试策略：把遗留 `mcp.tikhub.io` base URL 归一到官方域名，并让 worker policy 识别当前真实使用的 `TIKHUB_PROVIDER_TRANSIENT_FAILED` 为可重试错误。
- **验证**：本地先补红灯测试覆盖旧域名归一和 TikHub 瞬时错误重试，再转绿；随后通过 staging 部署和同一样本复现，确认是 base URL/契约问题、链接不支持，还是账号/权限问题。
- **后续事项**：若修复后同一样本仍 404，则下一轮只继续做 TikHub 请求层脱敏探测，区分链接不支持、账号权限和 base URL 配置残留；不回滚去盲修 worker、ASR 或 DeepSeek。

### BUG-20260707-002：EdgeOne 域名入口持续 308，业务规则未命中

- **发现日期**：2026-07-07
- **严重程度**：S1
- **状态**：FIXED
- **影响范围**：`djyying.asia` 域名入口、EdgeOne 回源、Caddy 入口规则。
- **现象**：域名接入后，外部访问和本机带 `Host: djyying.asia` 的请求持续返回 308；无效回源密钥请求也是 308，说明请求没有进入业务校验规则。
- **复现条件**：EdgeOne 已接入域名，但服务器运行时 `APP_DOMAIN` 与实际域名不一致，Caddy runtime 配置没有正确匹配 `djyying.asia`。
- **原因**：Caddy runtime domain 配置错误，不是 Web 应用服务挂掉。后续又发现 EdgeOne 回源请求头与服务器 `EDGEONE_ORIGIN_SECRET` 需要保持一致，否则即使入口规则修复也会被源站拦截。
- **修复**：将服务器运行时域名改为 `djyying.asia`；修复 Caddy 配置同时支持 HTTP/HTTPS 回源，保留 `X-EdgeOne-Origin-Verify` 校验；同步 EdgeOne 回源请求头与服务器密钥。
- **验证**：内部 `/api/health` 返回 200；外部 `https://djyying.asia/api/health` 返回 200 `{"status":"ok"}`；错误回源密钥返回 403；`:3000` 仍不能公网直出。
- **后续事项**：域名入口相关改动要先只读诊断 runtime 配置，再做最小变更；不得跳过回源密钥一致性检查。

### BUG-20260713-001：EdgeOne 双协议回源被正式 Caddy 配置重新覆盖

- **发现日期**：2026-07-13
- **严重程度**：S1
- **状态**：VERIFYING
- **影响范围**：staging 的 `/login`、`/topics` 和 `/api/health` 外部入口。
- **现象**：外部 HTTP/HTTPS 请求均返回指向自身 URL 的 308，业务路由和回源校验未被正常命中。
- **原因**：此前服务器运行时曾手工修复 HTTP/HTTPS 回源兼容，但 standard 部署会重新安装仓库 `deploy/Caddyfile`；该文件只有 `{$APP_DOMAIN}` 站点，Caddy 自动 HTTPS 重定向再次覆盖手工修复。
- **修复计划**：正式 Caddyfile 使用 `auto_https disable_redirects`，显式声明 `http://{$APP_DOMAIN}` 与 `https://{$APP_DOMAIN}` 共用同一回源保护和反向代理规则；部署脚本在覆盖 bind-mounted Caddyfile 后强制重建 Caddy，并验证恰有 1 个 running Caddy 容器，确保新配置实际加载；若重建或数量校验失败，发布失败且不写成功版本标记；保留 `X-EdgeOne-Origin-Verify`，不改变应用 Origin 或安全 Cookie 配置。
- **验证标准**：Caddy 容器配置语法通过；部署后 `/api/health` 返回 200，`/login` 不再同 URL 308，未登录 `/topics` 最多按应用逻辑跳转到 `/login`；错误回源头仍返回 403。
- **边界**：仅修复 staging 正式 Caddy 配置，不改 EdgeOne secret、应用容器、数据库卷或生产配置。

### BUG-20260708-001：管理员登录恢复被无效 MFA 加密密钥阻断

- **发现日期**：2026-07-08
- **严重程度**：S1
- **状态**：FIXED
- **影响范围**：后台 `/admin/login`、OWNER TOTP 校验、新 OWNER 创建。
- **现象**：旧 OWNER 密码重置后仍无法登录，继续创建新 OWNER 时出现 `INVALID_ENCRYPTION_KEY` 类阻断。
- **复现条件**：服务器 `ADMIN_MFA_ENCRYPTION_KEY` 存在但不是 base64 解码后 32 bytes 的 AES-256-GCM key。
- **原因**：项目安全实现要求 `ADMIN_MFA_ENCRYPTION_KEY` 必须是 base64 且解码后正好 32 bytes；旧配置不满足要求，导致 TOTP 加解密相关路径失败。
- **修复**：在服务器 `.env` 和 `.env.production` 中同步写入合法 32-byte base64 key；只重建 Web 服务，不改代码、不部署、不改管理员数据；外部 health 使用 90 秒短轮询窗口，避免 Web 重建瞬时 502 被误判为失败。
- **验证**：文件层与 web runtime 均为 `present=yes valid_32_bytes=yes`；`SESSION_COOKIE_SECURE` 保持存在；外部 health 返回 200；OWNER 数量仍为 1；备份文件存在且权限 600。
- **后续事项**：任何 MFA/管理员初始化问题先验证 key 格式，不要直接反复重置账号。

### BUG-20260708-002：新 OWNER 初始化脚本在 standalone 镜像内缺失

- **发现日期**：2026-07-08
- **严重程度**：S2
- **状态**：FIXED
- **影响范围**：新 OWNER 创建、后台恢复流程。
- **现象**：尝试在容器内执行 `scripts/bootstrap-admin.ts` 时失败，提示镜像内找不到该脚本。
- **复现条件**：生产镜像使用 Next.js standalone 输出，源码脚本不会完整进入运行时镜像。
- **原因**：初始化脚本属于源码/运维工具，不在 standalone runtime 镜像内；直接调用源码脚本不是可靠的生产恢复路径。
- **修复**：改用受控临时 Node 脚本，复用项目现有密码哈希、TOTP 加密和 recovery code 哈希格式，在服务器生成新 OWNER，并把敏感材料只写入 0600 setup 文件。
- **验证**：新 OWNER `owner2` 创建成功；OWNER 数量从 1 到 2，总管理员数 2；旧 OWNER 仍 active；新 OWNER TOTP 已配置，recovery codes 数量 8；`/admin/login` 与 `/api/health` 均 200；未打印密码、TOTP secret、OTP URI 或 recovery codes 明文。
- **后续事项**：旧 OWNER 是否停用需要单独决策；setup 文件内容只允许用户自己查看和保存，不得进入聊天、日志或仓库。

### BUG-20260708-003：后台邀请码列表只能看到脱敏码，无法复制已生成完整邀请码

- **发现日期**：2026-07-08
- **严重程度**：S2
- **状态**：OPEN
- **影响范围**：后台邀请码管理、用户注册测试。
- **现象**：后台邀请码列表展示为 `SVS-****5893` 这类脱敏形态，用户无法看到或复制已经生成的邀请码完整值。
- **复现条件**：进入后台邀请码页查看历史邀请码列表。
- **原因**：当前实现为了安全只在服务端/页面列表展示脱敏码；完整邀请码设计上只应在创建成功瞬间显示一次。但如果创建成功瞬间没有可靠复制/保存入口，运营就会丢失可用邀请码。
- **修复**：待处理。推荐方向是在“新建邀请码”成功响应中一次性显示本次新生成的完整邀请码，并提供复制按钮；刷新或返回列表后继续只显示脱敏码。
- **验证**：待验证。验收时必须确认历史列表仍不泄露完整码，新建成功态可以一次性复制完整码，注册可使用该码。
- **后续事项**：不要为了方便把所有历史邀请码完整展示出来；如果短期急用，可由受控服务器脚本一次性生成一个新邀请码并只给用户本人查看。

### BUG-20260708-004：生成页当前样本再次显示“当前链接无法自动提取”

- **发现日期**：2026-07-08
- **严重程度**：S1
- **状态**：BLOCKED
- **影响范围**：普通用户生成页 `/generate`，从抖音分享内容到参考结构拆解和最终文案生成的主链路。
- **现象**：页面显示固定失败提示 `当前链接无法自动提取，请更换可提取的抖音视频链接`。用户反馈前一次似乎已经提取完成并进入改写阶段，但随后再次失败。
- **复现条件**：当前截图中输入框可见内容像是分享文案片段，未能确认是否包含完整 `https://v.douyin.com/...` 或 `https://www.douyin.com/...` 链接。
- **当前判断**：问题已拆成两层。其一，前端输入里没抽到完整抖音 URL 时，页面会在创建任务前直接显示固定失败提示；其二，任务读取契约此前会在前端读取 transcript 后把数据库中的 transcript 清空，但保留 `status=succeeded`，形成 `succeeded + transcript missing` 脏状态。P1-21.5D 本轮先修第二层：空 transcript 不再允许保留 `succeeded`，并把缺失 transcript 的终态安全归类为内部错误码 `EXTRACTION_TRANSCRIPT_EMPTY`。
- **最新诊断**：`a684d74` 部署后，旧样本 `jobHash8=7f9122eb` 已不再出现 `succeeded + transcript missing`，而是得到 `transcript bucket=1-99` 后继续进入 `analyze-reference`，随后前端显示“参考脚本拆解失败，请稍后重试”。结合代码路径可确认：当前前端和后端都把“任意非空 transcript”视为可拆解输入，缺少“可拆解 transcript 门槛”，导致过短 transcript 也会进入 DeepSeek 结构拆解。对照样本 `jobHash8=aeb90f6c` 则仍停在提取阶段，状态为 `queued`、错误码 `ASR_SUBMIT_FAILED`、`transcript=none`，说明这不是 analyze-reference 通用故障，而是旧样本自身 transcript 质量不足触发的下游误推进。
- **已知历史**：项目此前已修复完整分享文案识别、状态复用、TikHub base URL、worker claim 观测、TikHub media URL 与 ASR 轮询等问题；因此本轮不再盲修 TikHub/worker，而是先补可观测性，把“没进后端”和“进后端后失败在哪个 errorCode”分开。
- **修复**：
  1. P1-21.5B 已增加 OWNER 可见的提取任务页，只展示脱敏字段：job/user/project hash8、sourceHost/sourceHash、status、errorCode、attemptCount/maxAttempts、时间戳、transcript 是否存在及长度桶，不展示完整 sourceUrl、transcript、media URL 或供应商原始响应。
  2. P1-21.5B 已把 `ASR_SUBMIT_FAILED` 从粗粒度失败补成安全子类型，但当时只停留在 provider 诊断和 stdout 日志，没有安全持久化到 `ExtractionJob`。
  3. P1-21.5D 本轮新增共享提取任务契约 helper，修复 `succeeded + transcript missing`：
     - worker 成功分支若拿不到可用 transcript，直接改判 `EXTRACTION_TRANSCRIPT_EMPTY`；
     - 任务查询接口不再在读取成功 transcript 后反向清空数据库 transcript；
     - 对历史遗留的 `succeeded` 但 transcript 缺失任务，接口会安全降级成失败，前端不再推进到参考结构拆解。
  4. 普通用户仍只看到 PRD 固定失败提示，不暴露 provider/internal details。
  5. P1-21.5F 增加共享 `reference transcript` 可用性判断：只有满足最小非空白长度且至少包含两个有效语义片段的 transcript，才允许进入 `analyze-reference`。过短 transcript 将被前端视为提取不可用，回落到固定提取失败提示；服务端 `analyzeReferenceScript` 也会用内部错误码 `REFERENCE_TRANSCRIPT_TOO_SHORT` 拦截直接调用。
  6. P1-21.5G+1 本轮补上最小持久化可观测性：不改 schema，而是把 `ASR_SUBMIT_FAILED` 的脱敏 submit 子类编码进现有 `ExtractionJob.errorCode` 安全细节层；OWNER 后台拆分显示“基础错误码 + 细分原因”，普通用户接口继续只返回固定失败文案。
  7. 同轮新增 TikHub 媒体候选摘要：记录被送进 ASR 的媒体 kind、format、字段路径，以及候选数量和路径/格式摘要。当前 web payload 额外覆盖 `video.bit_rate.play_addr`、`video.play_addr_265`、`video.play_addr_lowbr` 等安全路径名，便于后续区分“拿错媒体路径”与“ASR submit 本身失败”。
  8. P1-21.5J 收紧提取任务终态契约：worker 和同步提取 API 都复用 `reference transcript` 可用性判断，空白、缺失、过短或不可拆解 transcript 不再允许写成/返回成功，而是归类为 `EXTRACTION_TRANSCRIPT_EMPTY` 或固定提取失败提示；普通用户文案保持不变。
  9. P1-21.5M 补强 analyze-reference 服务端前置门槛：将空/不可用 transcript 判断抽成无供应商依赖的共享 helper，并补测试覆盖历史 `succeeded + empty/short transcript` 降级和服务端 analyze 前置拒绝，避免只依赖前端状态机。
  10. P1-21.5N 只读核查把下一层问题收窄到 TikHub media URL 与火山 ASR 下载交接面：代码确认当前 ASR submit 只传 `audio.url` / `audio.format`，没有可传 Referer、Cookie 或 User-Agent 的下载头字段；如果抖音 CDN URL 依赖防盗链头、短期签名或来源限制，直接把 URL 交给火山 ASR 会结构性失败。当前还不能定性为已证实根因，因为执行环境无法通过 SSH/OrcaTerm 读取最新任务的完整运行态脱敏诊断，也无法对同一个 selected media URL 做服务器侧 HEAD/Range 探测。缺失的最小证据是：selected media host/hash/path、服务器侧 HEAD/Range 状态类别、ASR submit/query 阶段错误枚举。
  11. P1-21.5O 实现最小媒体 relay 方案但默认关闭：TikHub media URL 先经过服务器 SSRF/超时/大小/content-type/重定向限制下载，FFmpeg 抽音频转 16k 单声道 MP3，再通过 COS/S3-compatible PUT 上传到短期对象 URL，最后把稳定 URL 提交给火山 ASR；本地临时文件在成功/失败后通过 `finally` 清理。部署校验在 `MEDIA_RELAY_ENABLED=1` 时要求 COS 与 `MEDIA_RELAY_PUBLIC_BASE_URL` 配置，缺失时 fail closed；对象生命周期仍需在 COS 控制台配置短 TTL。
  12. P1-21.5Q 增加 COS `DeleteObject` 主动清理：ASR submit 明确拒绝或 query 进入成功/失败终态后尝试删除远端临时音频；submit 结果不确定、query transport failure 或轮询超时时不提前删除，交给 COS 一天生命周期兜底。删除失败仅记录 `delete attempted`、结果枚举和 object key hash8，不改变用户流程。COS 生命周期最短为一天，原“一小时生命周期”口径已删除。
  13. P1-21.5T 补齐 analyze-reference / DeepSeek 脱敏失败观测：记录 `AI_PROVIDER_FAILED` 的 HTTP 状态类别、timeout、network、empty content、invalid JSON、未配置和 unknown 子类，以及 analyze-reference 的 transcript 长度桶、sections 数量、model、base host/path、attempts 和 user hash8；不记录 key、prompt、transcript、raw response 或完整用户标识。普通用户错误文案保持不变。
  14. P1-21.5W 将火山 ASR submit 的 `request.enable_punc` 打开为 `true`，让转写结果保留可供结构拆解使用的标点；reference transcript gate 继续拒绝纯无标点长句，不降低可拆解门槛。staging relay 脱敏核对确认 web/worker 均启用 relay、并发为 1、COS 配置字段齐全且健康。
- **验证**：新增提取任务契约测试与前端状态机测试，覆盖空 transcript 成功结果改判失败、历史 `succeeded` 无 transcript 的前端兼容处理；同时保留并复跑现有 ASR 空文本失败测试。P1-21.5G+1 额外新增错误码编码/解析测试、OWNER 后台脱敏展示测试、worker retry 对细分错误码的兼容测试，以及 `tikhub-media` 对 `video.bit_rate.play_addr` 新路径的覆盖。P1-21.5Q 定向测试 40/40 通过，覆盖 DeleteObject 成功、失败不影响转写、终态后删除、非终态延迟、本地 finally cleanup 和 raw key 不泄露；P1-21.5T 新增 DeepSeek HTTP、timeout/network、empty content、invalid JSON 和 analyze 日志脱敏测试；P1-21.5W 新增 ASR `enable_punc=true` 请求体断言及长无标点 transcript gate 回归测试；全量测试 160 项中 144 pass、16 gated skip、0 fail，lint/typecheck/build 通过。
- **后续事项**：
  1. 如果最新页面失败仍发生在“前端没解析出完整抖音 URL”，需要单独补一轮输入态诊断或 UI 提示优化，但不能泄露内部信息。
  2. 如果最新真实任务仍停在 `ASR_SUBMIT_FAILED`，下一步应基于新细分类继续查 submit endpoint、鉴权、限流或媒体格式，而不是再回头猜 session/cookie。
  3. 当前没有 401/302/session missing 的明确证据，登录态问题不作为本轮主结论展开。
  4. P1-21.5D 已确认另一条独立契约问题：任务查询接口此前会在前端读取 transcript 后把数据库里的 transcript 清空，但保留 `status=succeeded`，导致后台观测和后续旧任务兼容路径出现 `succeeded + transcript missing` 的脏状态。本轮修复改为保留短 TTL 内的 transcript，并对真正的空 transcript 成功结果统一改判 `EXTRACTION_TRANSCRIPT_EMPTY`。
  5. 即使本轮收口后，另一个真实样本仍可能继续暴露 `ASR_SUBMIT_FAILED` 这条独立问题线；下一步应直接根据后台显示的 submit 子类、selectedMediaPath 和 candidate summary 继续修 submit endpoint、鉴权、限流或媒体格式，而不是再回头修改 transcript 契约。
  6. P1-21.5I 续跑确认代码侧 ASR provider 已是火山官方“录音文件识别标准版 HTTP”接口族形态：submit/query endpoint、`x-api-key`、`X-Api-Resource-Id`、`X-Api-Request-Id`、submit 阶段 `X-Api-Sequence:-1`、`audio.url/format` 和 `request.model_name` 均已由现有代码支持。当前 staging 配置漂移仍指向 Ark 接口族的证据来自部署文档和上一执行线程的脱敏诊断。
  7. P1-21.5I 尝试进入 staging 读取/修正脱敏 env 指纹时，SSH 在服务器侧关闭连接；`gh` 当前认证 token 无效，无法推送临时 self-hosted maintenance workflow；现有 deploy workflow 只同步 release 配置并保留 runtime env，不具备修改 `.env.production` 的能力。因此本轮无法备份或修改 staging env，也无法复测同源样本。公网 `https://djyying.asia/api/health` 返回 200 `{"status":"ok"}`。
  8. 恢复受控服务器写入通道后，按脱敏方式把 ASR env 修为官方 HTTP 文件识别接口族：submit `openspeech.bytedance.com` + `/api/v3/auc/bigmodel/submit`，query `openspeech.bytedance.com` + `/api/v3/auc/bigmodel/query` 或由 submit 推导，resource/model 使用同一 ASR 产品授权资源。若修正后仍是 `submit_auth_rejected`，停止继续尝试，并在火山控制台检查 API key 与 ASR 资源、模型、服务开通和项目授权是否同属一套配置。
  9. P1-21.5I-1 已通过 OrcaTerm 恢复受控写入：在 staging `/opt/douyin-script` 下创建了 0600 权限备份目录，备份 `.env` / `.env.production`，并写入无敏感测试文件；输出仅包含 `env_backup=yes`、`envprod_backup=yes`、`write_check=yes`。SSH 仍不可用，`gh` 认证仍无效。
  10. P1-21.5I-2 已完成 env 修正和 web/worker 重启：`.env` 与 `.env.production` 的 ASR submit/query host/path 均为 `openspeech.bytedance.com` + `/api/v3/auc/bigmodel/submit|query`，resource/model/API key 只用 hash8 与长度桶确认；web/worker 均 healthy，公网 `/api/health` 返回 200。复测同源样本和 OWNER 后台确认尚未完成，因为浏览器安全策略随后阻止继续操作 OrcaTerm 和 `djyying.asia` 页面；不得绕过该策略继续操作。下一步需要用户在 OrcaTerm 手动执行脱敏 job 查询/复测命令，或恢复 SSH/GitHub auth 后由 agent 继续。
  11. P1-21.5I-3 续跑收到用户手动复测结果：最新任务已能创建并进入 worker，但仍以裸 `ASR_SUBMIT_FAILED` 失败，attempt `3/3`，没有 `fr=` 细分；worker 日志关键词也未命中 ASR submit 细分原因。执行 agent 尝试只读确认 staging 镜像/容器内是否包含 `encodeExtractionErrorCode` / `failureReason` 细分诊断逻辑，但 SSH 仍被服务器侧关闭，`gh` token 仍无效，OrcaTerm 页面可见但当前无法提交新命令。因此本轮无法判断是 stale image 还是 diagnostic 在 provider 链路中丢失，也未改代码、未部署、未改火山配置。
  12. 复盘沉淀：外部 Provider 失败不能在内部诊断里只落一个大错误码。后续真实 Provider 复测前，必须先确认运行镜像包含细分诊断逻辑；如果 `ASR_SUBMIT_FAILED` 没有 `fr=` 细分，不允许继续猜 TikHub、火山配置或 DeepSeek。处理规则已沉淀到 `docs/PROVIDER_FAILURE_DIAGNOSTICS.md`：普通用户仍只看固定失败文案，OWNER/agent 只看脱敏子类、hash8、host/path、attempt 和长度桶。

### BUG-20260710-005：COS relay PutObject 使用的访问密钥无效

- **发现日期**：2026-07-10
- **严重程度**：S1
- **状态**：BLOCKED_EXTERNAL_CONFIG
- **影响范围**：启用 COS relay 的真实抖音提取任务；TikHub 下载和 FFmpeg 转码完成后，无法上传临时音频到 COS，因此不会进入火山 ASR。
- **现象**：staging worker 使用当前运行时 COS 配置执行极小 `PutObject` 探针，返回 `4xx / InvalidAccessKeyId`；本次没有成功创建对象，因此没有 DeleteObject 动作。
- **原因**：第一轮探针的 `InvalidAccessKeyId` 已因用户更新密钥推进；随后发现仓库原 COS 适配器使用 AWS SigV4，而腾讯 COS 原生 REST 接口要求 `q-sign`。该签名实现已修复并部署，但使用当前新运行时密钥的官方 q-sign 对照探针仍返回 `4xx / SignatureDoesNotMatch`，因此剩余最小根因集合是 SecretId/SecretKey 不成对、密钥类型为临时凭据但缺少安全令牌，或腾讯云侧凭据与 bucket 账号/region 不匹配。
- **修复**：commit `3d41430` 将 COS PutObject/DeleteObject 改为腾讯 `q-sign`，上传签入 `Host` 与 `Content-Length`，并补充签名头测试；CI、全量测试、lint、typecheck、build 和 staging 部署均通过。未改业务 env、TikHub、ASR、DeepSeek、数据库或 UI。
- **验证**：staging relay 仍为并发 1，endpoint host 为 `cos.ap-guangzhou.myqcloud.com`，bucket hash8=`b3aa25a5`；部署后的 q-sign 探针返回 `SignatureDoesNotMatch`，因此 public HEAD 与 DeleteObject 未执行，也没有真实样本复测。未打印凭据、完整 URL 或 COS 原始响应。
- **后续事项**：用户需在腾讯云 CAM 确认新 `COS_ACCESS_KEY_ID` 与 `COS_SECRET_ACCESS_KEY` 是同一永久密钥对；若使用临时密钥，还需提供安全令牌并单独扩展配置契约。修复后先重跑 Put/Public HEAD/Delete 探针，三步通过后再复测真实样本。

### BUG-20260710-006：官方 COS SDK 对照探针返回 NoSuchBucket

- **发现日期**：2026-07-10
- **严重程度**：S1
- **状态**：BLOCKED_EXTERNAL_CONFIG
- **影响范围**：COS relay 暂时无法上传临时音频，因此真实抖音链路尚未进入火山 ASR。
- **现象**：staging worker 使用腾讯官方 Node SDK `cos-nodejs-sdk-v5@2.15.4` 和当前 runtime 配置执行最小 `PutObject`，返回 `4xx / NoSuchBucket`；request id hash8=`2c1414c7`，object key hash8=`6c3485dc`。公共 HEAD 与 DeleteObject 未执行，因为 PutObject 未成功。
- **原因判断**：官方 SDK 已绕过项目 q-sign 实现，结果不再是 `SignatureDoesNotMatch`，当前最小根因收敛为 bucket 不存在于该 endpoint/region、bucket 名或账号 app ID 不匹配，或 endpoint/region 配置不对应。仅凭 `NoSuchBucket` 不能把 SecretId/SecretKey 判定为成对有效或无效。
- **验证**：endpoint host=`cos.ap-guangzhou.myqcloud.com`，bucket hash8=`b3aaa25a`；本地对用户提供的 bucket 名计算出的 hash8 与 runtime 一致。未打印凭据、完整 URL、完整对象 key 或 COS 原始响应；未修改代码、env、数据库或业务链路。
- **后续事项**：用户先在腾讯云 COS 控制台核对 bucket 的精确名称（含 app ID）、所属账号、地域是否为 `ap-guangzhou`，并确认 SDK endpoint 与 bucket 地域匹配。只有官方 SDK 的 Put/Public HEAD/Delete 三步均通过后，才允许复测真实抖音样本；届时再判断项目 q-sign 是否仍有独立问题。

### BUG-20260710-007：项目 COS adapter 使用了错误的 COS request shape

- **发现日期**：2026-07-10
- **严重程度**：S1
- **状态**：VERIFYING
- **影响范围**：COS relay 业务上传无法进入稳定对象 URL 阶段，真实样本不能进入火山 ASR。
- **现象**：腾讯官方 SDK 默认参数的 Put/Public HEAD/Delete 三步均为 `2xx`；项目手写 `uploadRelayObject` / `deleteRelayObject` 先后暴露 host shape、签名 header shape 问题。最新 staging 手动探针在 deployed head `bd41899` 上确认项目 adapter PUT 已到 COS，但仍返回 `4xx / InvalidRequest`，requestId hash8=`59d5728d`，因此 public HEAD/GET 和 DeleteObject 未执行。
- **原因**：根因是项目手写 COS REST/q-sign 适配器长期偏离腾讯 COS SDK 成功请求形态。继续微调 host、`q-header-list` 或 `Content-Length` 会反复踩签名细节，不符合最短可靠路径。
- **修复**：`lib/media-relay/object-storage.ts` 改为使用官方 `cos-nodejs-sdk-v5` 执行 `PutObject` / `DeleteObject`；项目代码只保留 relay 安全封装、对象 key 规范化、public URL 构造和脱敏诊断。新增 SDK 错误的 `httpStatusClass`、`providerErrorCode`、`requestIdHash8` 输出；`lib/media-relay/relay.ts` 把 COS 上传失败的脱敏字段写入 relay diagnostic；staging COS adapter probe workflow 同步改为读取 adapter 返回的脱敏字段。不改变公共 base URL、用户文案、TikHub、ASR、DeepSeek、数据库或 UI。
- **验证**：本地 `tests/media-relay/media-relay.test.ts` 6/6 通过，`npm test` 160 项中 144 pass/16 skip/0 fail，`npm run typecheck`、`npm run lint`、`npm run build` 通过；`npm audit --omit=dev --audit-level=high` 未发现 high/critical 漏洞，只保留 Next/PostCSS moderate 提示且官方建议为破坏性 `--force` 修复。仍需部署后复跑 staging 项目 Put/Public HEAD/Delete 三步；三步通过后才允许跑真实抖音样本。未打印凭据、完整 URL、完整对象 key 或 provider 原始响应。
- **后续事项**：部署官方 SDK 适配器后，必须复跑项目 Put/Public HEAD/Delete 三步；三步通过后再复测真实抖音样本，判断是否进入火山 ASR。

### BUG-20260711-001：DeepSeek analyze-reference API POST 在 staging 出现网络失败

- **发现日期**：2026-07-11
- **严重程度**：S1
- **状态**：VERIFYING
- **影响范围**：已获得可用 transcript 的 `analyze-reference` 和后续 `generate-final`。
- **现象**：真实全链路样本已越过 COS 和火山 ASR 并得到可用 transcript，但 `analyze-reference` 返回 `AI_PROVIDER_FAILED / network_error / attempts=1`，生成阶段按依赖关系跳过。
- **原因**：P1-21.5AH 在 staging worker runtime 内执行的最小探针确认：DeepSeek key 存在，DNS、TCP 443 和 HTTPS HEAD 均成功，只有认证 API POST 返回 `network_error`。原服务对该瞬时失败在第一次 catch 后立即返回，未给予连接短暂抖动恢复机会。
- **修复**：P1-21.5AI 新增独立 self-hosted DeepSeek 连通性 probe，只输出 deployed head、key presence、base host/path、model、DNS/TCP/HTTPS/API 状态类别、脱敏失败分类和尝试次数。`lib/ai/deepseek.ts` 现在对 `network_error`、`timeout`、HTTP 429 和 5xx 以 250ms、500ms 退避重试，最多三次总尝试；401/403 等鉴权类 4xx 仍立即失败，不读取或输出 key、prompt、transcript 或响应正文。
- **验证**：定向 DeepSeek 测试覆盖 401 不重试、429/5xx 退避重试、timeout/network 三次尝试和原有 JSON 输出边界；commit `932b585` 的 CI、镜像构建、staging 部署均通过。新 runtime 真实样本确认 `deployedHead=932b585`，COS/ASR 已通过，`analyze-reference` 连续三次仍为 `network_error`，最终 `AI_PROVIDER_FAILED`，`generate-final` 按依赖跳过。
- **后续事项**：不要继续修改业务代码；由网络/运维侧检查 staging 对 DeepSeek API POST 的 egress、代理、防火墙、连接复用策略，或联系供应商确认 API POST 链路。修复外部链路后，只需重跑同一真实样本探针。

### BUG-20260713-001：TikHub 标题文本绕过 ASR 直接作为原口播

- **发现日期**：2026-07-13
- **严重程度**：S1
- **状态**：FIXED
- **影响范围**：TikHub 同时返回媒体地址和标题类文本时的原口播提取结果。
- **现象**：较长的 `text` 类标题或话题文本可能被直接当作 `provider_transcript`，绕过媒体转写。
- **原因**：transcript provider 在媒体地址存在时仍允许足够长的 provider 文本直接成功；同时标题类字段与可信转写字段没有明确分组。
- **修复**：媒体地址存在时强制进入 Volcengine ASR；无媒体地址时只接受明确的转写字段，`text`、`caption`、`subtitle`、`title`、`desc` 和话题类文本不再作为直接 transcript。
- **验证**：新增媒体优先、可信直转写、标题类文本拒绝三组回归测试；全量测试 208 项中 192 pass、16 gated skip、0 fail。
- **后续事项**：staging 部署后使用脱敏真实样本确认原口播来源为 ASR 结果，而不是标题或话题文本。

### BUG-20260713-002：重复标题定向修复对 JSON 字符串二次序列化

- **发现日期**：2026-07-13
- **严重程度**：S1
- **状态**：VERIFYING
- **影响范围**：25 宫格批次出现重复标题时的定向修复链路。
- **现象**：DeepSeek 修复请求本身返回 2xx 且 `finish_reason=stop`，但修复阶段报 `missing_or_invalid_field`，导致批次失败且不扣额度。
- **原因**：`requestDeepSeekJson.content` 已经是 JSON 字符串，旧代码再次 `JSON.stringify`，解析器收到带引号的字符串而不是对象。
- **修复**：修复解析直接使用 provider content；新增 `duplicateRepairStage` 脱敏日志字段，并补充修复成功/失败阶段测试。未调整 Prompt、预算、重试或前端轮询。
- **验证**：修复前 fixture 测试失败；直接传入 JSON 字符串后 targeted repair parser 测试通过，日志仅暴露 allowlisted stage 和既有诊断桶。
- **后续事项**：部署 staging 后重新观察一次真实重复修复链路，确认 `duplicateRepairStage=validated` 或获得新的脱敏失败分类；通过后再做完整 25 条验收。

### BUG-20260714-001：定制化脚本第二轮从零重写导致短稿退化

- **发现日期**：2026-07-14
- **严重程度**：S1
- **状态**：VERIFYING
- **影响范围**：定制化脚本首轮生成与长度过短后的唯一一次语义修复。
- **现象**：PR51后真实staging任务首轮为`finishReason=stop`、JSON可解析、`parserReason=length`、`scriptLengthBucket=240_259`、`direction=short`、`lineCountBucket=15_20`；第二轮仍主动结束且退化为`under_200`，行数桶仍为`15_20`。任务不扣额度但用户拿不到脚本。
- **复现条件**：首轮返回接近目标且行结构稳定的短稿；旧二轮仅携带计数和抽象扩写要求，不携带已通过格式/安全校验的短稿，因此模型实际从零重写并可能进一步缩短。
- **原因**：真实证据继续排除截断、超时和JSON解析失败。PR51解决了可计算目标，但“所有失败正文一律不回灌”使模型无法在接近合格的安全短稿上原地补足；第二轮属于重新生成，而不是扩写。
- **修复**：先调整领域校验顺序，只有short、通过全部现有非长度确定性校验且当前Worker内部精确15行时，才把规范化短稿作为最后一个user JSON字段原地扩写。其他失败继续fresh重写且不回灌。短稿只存同一Worker内存，不入DB/API/日志/错误；日志继续使用非精确行数桶。
- **验证**：失败测试先确认旧实现存在3个目标失败，修复后聚焦测试26项中24通过、0失败、2项因本地Docker未运行而跳过；本地全量311项中293通过、0失败、18项环境门禁跳过。PR隔离PostgreSQL CI实际执行311项，309通过、0失败、2项仅因staging外部配置跳过；额度、持久化无draft、两次修复、失败不扣额和Worker重启总调用上限用例均已运行。Lint、类型检查、生产构建、Prisma validate/migration、Caddy validate和依赖审计通过。240/15、under200/15安全回灌，以及无依据数字、禁用表达、句式错、上一版重复、非15行不回灌均有自动化覆盖；仍须完成staging部署健康验证。本轮不调用真实DeepSeek。
- **后续事项**：部署后交验收Agent使用真实staging任务验证原地扩写质量；不得直接推production。

### BUG-20260714-002：24句数组契约能否稳定满足完整脚本校验尚无真实证据

- **发现日期**：2026-07-14
- **严重程度**：S2
- **状态**：INVESTIGATING
- **影响范围**：仅限 staging 决策探针，不影响现有定制化脚本产品链路。
- **现象**：现有15行正文字符串在真实模型输出中仍可能不足280字；“返回24个独立句子”是否能同时稳定满足句式、事实安全与280—300字尚未经过真实 staging 证据验证。
- **原因**：待探针确认。当前只有结构推理，没有连续真实模型调用结果，不能把数组方案当成已验证修复。
- **修复**：新增默认关闭、双 staging 开关门控、只读且不扣额度的隔离探针。只有 `CUSTOM_SCRIPT_SENTENCE_PROBE=STAGING` 与 `STAGING_ENABLE_REAL_PROVIDERS=1` 同时成立才运行；`NODE_ENV=production` 只是 staging 容器构建模式，不能单独代表生产部署。模型返回24句数组，服务端仅原样换行拼接并复用现有完整 `finalScript` 校验；主业务链路保持不变。
- **验证**：自动化覆盖数组边界、原样拼接、现有安全校验、门控、无数据库写路径和日志脱敏。部署 staging 后由主 Agent 在授权终端最多执行5次真实调用；任意失败立即停止，只有五次全部通过才允许 `gate=true`。
- **后续事项**：真实探针通过后再单独评估产品契约；本条不授权推 production 或直接替换现有生成路径。

### BUG-20260714-003：24句探针仍依赖模型一次性命中总长度

- **发现日期**：2026-07-14
- **严重程度**：S2
- **状态**：INVESTIGATING
- **影响范围**：仅限staging决策探针；现有定制化脚本API、Worker和额度链路不变。
- **现象**：PR53的真实探针已经能够取得结构化24句证据，但单次返回仍需同时命中句式安全与280—300总长度。现有证据不足以证明该组合可连续稳定通过，因此不能直接替换主业务契约。
- **复现条件**：模型返回24个单句，其中任何结构或安全问题会使整轮失败；即使每句合格，总长度偏短或偏长也会失败。
- **原因**：第一次模型调用同时承担内容写作和精确总长约束，服务端只有整体验收，没有可复用的完整安全扩写候选与确定性长度组合机制。
- **修复**：新增第二个默认关闭的隔离探针。第一次生成24句，第二次按索引返回包含原句精确连续子串、严格变长且不新增商业事实的完整替换候选；服务端安全过滤后用确定性子集和选择完整候选，使最终长度接近290并复用现有完整校验。任何失败均停止且CLI非零退出。
- **验证**：先以自动化覆盖连续子串、严格增量、安全过滤、子集决胜、无解、280/300边界、双调用上限、只读无扣额、脱敏日志和CLI退出码；CI与staging部署通过后，再由主Agent在授权终端运行真实DeepSeek探针。本条不声明方案已有效。
- **后续事项**：真实探针只有连续5轮全部通过才可进入产品契约评估；本阶段不推production。

### BUG-20260714-004：索引扩写探针的完整replacement协议触发24条原样回显

- **发现日期**：2026-07-14
- **严重程度**：S2
- **状态**：VERIFYING
- **影响范围**：仅限staging索引扩写决策探针；现有定制化脚本产品API、Job、Worker、页面、额度与数据库不变。
- **现象**：部署SHA `0ad4d25dd4a0cb57e8bd2637a8fedd4951a1d591` 的真实staging探针第1轮通过、第2轮失败。失败轮两次Provider均`finishReason=stop`且JSON可解析，数量与索引均为24，但24条replacement全部原样回显，`validReplacementCount=0`、`replacement_not_longer=24`、`no_solution`，最终`gate=false,runsCompleted=2`。
- **原因**：第二次协议同时要求模型复制完整原句、增加前缀、保持单句与严格长度。模型能遵守JSON结构，却不能稳定完成逐项扩写；逐字保留原句本应由确定性服务端承担。
- **修复**：第二次AI只返回24项`{index,prefix}`；服务端严格校验prefix后只执行`prefix + originalSentence`。prefix必须至少含一个汉字，拒绝空白/标点、换行、终止标点、编号/标题、Emoji、标签/占位符、CTA和数字；拼接后继续复用单句25字、禁用表达、数字事实、CTA、事实安全和完整280—300校验。保留原确定性子集选择，不接入产品链路。
- **验证**：prefix协议、24项原样回显回归、服务端精确拼接、空白/标点/换行/终止标点/编号/标题/Emoji/标签/CTA/数字、索引完整性、单句25字、279/280/300/301、无解和日志脱敏均有自动化覆盖。聚焦18/18通过；全量338项中320通过、18项因本地缺少隔离数据库或staging配置跳过、0失败；typecheck、lint、生产构建、Prisma validate/schema diff、production audit与diff check通过。仍需CI隔离数据库门禁、staging部署以及主Agent连续5轮真实DeepSeek探针；只有`gate=true,runsCompleted=5`才可进入下一阶段。
- **后续事项**：当前确定性事实校验只覆盖数字+单位；“每天现做”“免费配送”“进口原料”等非数字商业事实仍必须由固定安全资料、Prompt限制和后续20组真实事实边界验收控制，不能宣称本修复已确定性解决。

### BUG-20260714-005：索引前缀探针可用非法24项和空子集错误通过gate

- **发现日期**：2026-07-14
- **严重程度**：S1
- **状态**：VERIFYING
- **影响范围**：仅限staging索引扩写决策探针；产品API、Job、Worker、额度、页面和production均未受此探针接入影响。
- **现象**：Bug Agent用实际对抗fixture复现：24项都带额外旧字段`replacement`时，逐项均因`prefix_value`无效，但数组长度和索引仍让`exact24=true`；基础稿288字时确定性选择器接受空子集，runner随后把失败原因覆盖成`none`并得到`gate=true,runsCompleted=5`。另有国旗Emoji、U+2028、零宽/format字符、反引号、括号占位符、列表标题和中文数字可绕过旧prefix过滤；finalizer还信任调用方传入的replacement/delta派生值。
- **复现条件**：第二次Provider返回24个索引完整但内层shape或prefix非法的对象，同时首轮基础稿自身已满足280—300；或直接向finalizer注入与prefix/original不一致的replacement/delta。
- **原因**：数量成功、逐项合法、实际采用前缀这三个条件没有形成同一gate；prefix规则是宽松的排除列表；候选类型错误地长期保存可重建的replacement/delta。
- **修复**：prefix收紧为2—4纯汉字窄契约，拒绝中文数字、Unicode数字、CR/LF/U+2028/U+2029、format/零宽字符、Emoji/旗帜、反引号、标点、标签/括号占位符、标题/列表和CTA。只有24项全部精确字段且合法时`exact24=true`；runner同时要求`validPrefixCount=24`。子集选择排除空集合；候选只保存`index + prefix`，finalizer重新校验并从原句拼接、重算delta与最终长度，忽略任何调用方伪造派生值。
- **验证**：红测先在旧实现稳定出现6项失败；修复后聚焦24/24通过。全量344项中326通过、18项因本地缺少隔离数据库或staging配置跳过、0失败；typecheck、lint、生产构建、Prisma validate/schema diff、production audit与diff check均通过。仍需CI在隔离数据库运行不跳过门禁、合并并部署staging；本轮禁止真实DeepSeek和production。
- **后续事项**：非数字商业事实仍不使用关键词黑名单伪装解决，继续保留后续20组事实边界验收。

### BUG-20260714-006：自由文本前缀仍可新增非数字商业事实并产生重复口播

- **发现日期**：2026-07-14
- **严重程度**：S1
- **状态**：VERIFYING
- **影响范围**：仅限 staging 索引扩写决策探针；产品 API、Job、Worker、额度、页面与 production 尚未接入该探针协议。
- **现象**：Bug Agent 用实际 fixture 证明，`每天现做`、`免费配送`、`进口原料`、`官方认证`、`绝对有效` 等不含数字的商业事实或指令可以通过旧自由文本 prefix 校验；同一个 `此刻` 还能重复进入15句并通过长度 gate。继续扩大汉字或关键词黑名单无法证明自然口播，也无法覆盖未知事实表达。
- **复现条件**：第二次模型响应仍能自由生成2—4个汉字 prefix，或24项响应为多个索引重复提供相同自由前缀；确定性选择器只优化长度、替换数和索引，不约束固定语义集合、单一前缀使用次数或相邻重复。
- **原因**：信任边界仍让随机模型创造服务端随后会拼入正文的文字。Unicode 形态校验只能判断字符结构，不能证明文字不含商业事实、指令或不自然表达；选择器也没有把口播多样性纳入可验证约束。
- **修复**：第二次 AI 只返回精确 `prefixChoices[{index,prefixIds}]` 契约；`prefixId` 只能来自服务端10项固定枚举，每项1—3个不重复的已知 ID。候选输入顺序不表达偏好，服务端按固定枚举顺序规范化；服务端仍是 ID→固定无商业事实衔接短语的唯一映射来源，只保存 `index + prefixId`，finalizer再次映射、拼接并重算长度。选择器限制同一ID最多2次、相邻选中句不得同ID、选中超过2句时至少使用2种ID，并继续使用“距290最近→替换更少→索引/ID稳定顺序”决胜。
- **验证**：新增 exact schema、旧自由prefix、未知ID、枚举注入、额外字段、索引/ID数量与重复、固定映射重建、伪派生字段、多样性无解、280/300边界、增量不足、单句超25、20组非数字事实、Prompt示例多样、双门禁、只读、脱敏、调用上限和CLI非零退出红测。修复后聚焦测试25/25通过；全量345项中327通过、18项因本地缺少隔离数据库或staging配置跳过、0失败；typecheck、lint、生产构建、Prisma validate/generate/schema diff、production audit与diff check全部通过。本轮未调用真实 DeepSeek，未触碰 production；待CI与staging部署完成后交验收Agent复核。
- **后续事项**：自动化与 staging 部署通过后，由主 Agent 运行连续5轮真实 DeepSeek 探针；只有 `gate=true,runsCompleted=5` 才进入产品链路评估。

### BUG-20260715-001：prefixId探针日志仍暴露精确计数分布

- **发现日期**：2026-07-15
- **严重程度**：S2
- **状态**：VERIFYING
- **影响范围**：仅限隔离staging prefixId探针的stdout指标；商家资料、Prompt、模型正文和产品链路未因此暴露。
- **现象**：Bug Agent检查实际 `ReplacementProbeMetric` 与日志fixture后确认，外部对象仍包含精确 `validChoiceCount`，`reasonCounts` 和 `baseSentenceLengthBuckets` 的值也仍是精确number。
- **复现条件**：运行任一成功或校验失败的replacement probe fixture并解析首行JSON，即可读取有效choice总数、逐失败原因次数和各句长区间的精确句数。
- **原因**：PR63只对候选总数和最终长度做桶化，内部gate所需精确计数被直接复用到外部metric；类型仍使用宽泛`string`，没有在编译边界封闭允许值。
- **修复**：外部`ReplacementProbeMetric`删除精确`validChoiceCount`并将`reasonCounts`改为`reasonCountBuckets`；原因计数与基础句长分布的每个值只能是`0|1_5|6_12|13_23|24`，其中`24`表示大于等于24。候选、长度、finish reason、解析错误与token等可观测字段均收紧为封闭联合类型；内部精确值仍只供同进程gate使用。
- **验证**：红测证明旧实现仍输出精确总数与number分布；修复后新增外部键白名单、嵌套值桶白名单和numeric path闭集测试通过。与选择器修复合并后，聚焦31/31通过；全量351项中333通过、18项因本地缺少隔离数据库或staging配置跳过、0失败。typecheck、lint、生产构建、Prisma validate/generate/schema diff、production audit与diff check全部通过；本轮没有调用真实DeepSeek，等待CI与staging部署验收。
- **后续事项**：不减少定位所需的分类维度，不新增业务日志或持久化。

### BUG-20260715-002：prefixId选择器在大规模无解候选上搜索成本失控

- **发现日期**：2026-07-15
- **严重程度**：S2
- **状态**：VERIFYING
- **影响范围**：仅限隔离staging prefixId探针的确定性子集选择；尚未进入产品API、Job、Worker或production。
- **现象**：实际运行24个索引×每索引3个固定ID、base=200且全局可达增量不足的fixture，旧实现5秒内未返回，人工终止时累计约12.9秒CPU；简单3个短IDfixture可快速返回，证明慢点来自跨10个ID的大量无解组合，而非启动或导入开销。
- **复现条件**：候选覆盖10个ID和大量索引，但在每ID最多2次约束下最大总增量仍不足以把base提升至280；旧选择器仍按全局2—5长度界逐目标、逐choiceCount深搜。
- **原因**：预处理未校验delta是否等于固定映射长度，也未计算实际索引与每ID上限下的全局可达增量；递归缺少后缀ID容量与增量界，memo用10位计数字符串且没有状态/转移硬预算。
- **修复**：候选预处理重新从固定ID映射计算delta并拒绝伪造长度，按`index + prefixId`去重稳定排序；选择器先用实际候选、每ID最多2次和后缀容量计算可达增量，再按剩余choice count动态剪枝。memo使用10个ID计数的三进制整数编码，并设置250k唯一状态、1m分支转移和24层固有深度上限；预算耗尽返回稳定的`selection_budget`，不会返回半成品或回退自由文本。
- **验证**：红测在旧实现稳定复现24×3/base=200超过5秒、伪造delta被采信和极小预算无效；修复后新增6项选择器预算测试全部通过。24×3/base=200子进程约138—186ms内返回，base=208/220有解与无解稳定，base=240/264保持PR63既有选择答案，倒序、重复与连续5次结果一致；极小预算和finalizer均保留`selection_budget`。聚焦31/31通过；全量351项中333通过、18项跳过、0失败，全部静态和构建门禁通过，等待CI与staging部署验收。
- **后续事项**：不得以硬拒绝base=200修表象，不调用真实DeepSeek，不推production。

### BUG-20260715-003：prefixId候选偏好顺序被误作安全门禁

- **发现日期**：2026-07-15
- **严重程度**：S2
- **状态**：VERIFYING
- **影响范围**：仅限隔离 staging prefixId 探针的第二次响应校验；产品 API、Job、Worker、额度、页面和 production 均未接入该探针协议。
- **现象**：真实 staging 第一轮 base JSON 与24句数量均正常；第二次响应 JSON 可解析，24项 shape、known ID 与 unique ID 均通过，但模型按偏好返回逆序候选时被 `prefix_id_order` 拒绝，整轮 gate 失败。
- **复现条件**：构造24项精确 `prefixChoices`，每项均返回两个互不重复的已知 ID，但顺序与服务端枚举相反；旧实现稳定返回 `prefix_id_order`。
- **原因**：候选数组顺序不承载安全事实或业务偏好，selector 和 finalizer 本就按服务端枚举稳定决胜；validator 额外要求模型预先排序，把非语义格式偏好错误升级为安全门禁。
- **修复**：保留外层/内层精确 shape、24项、索引、1—3项数量、known 与 unique 校验；接受任意候选顺序，并在生成候选前使用 `compareStagingReplacementPrefixIds` 规范化。Prompt 明确顺序无偏好、服务端规范化；`prefix_id_order` 从活动诊断联合类型、原因桶和旧拒绝测试删除。
- **验证**：新增24项、每项两个known unique ID逆序的红测；旧实现实际失败且原因明确为 `prefix_id_order`，修复后通过并逐项输出稳定 canonical 候选顺序。兼容性审计确认该原因只存在于隔离探针的临时 stdout 诊断与测试/文档，不进入数据库、产品 API、Worker 或前端；历史日志仍是可读 JSON，运行时不回放历史原因，因此不保留不可达兼容分支。聚焦32/32通过；全量352项中334通过、18项因缺少隔离数据库或staging配置跳过、0失败；typecheck、lint、生产构建、Prisma validate/generate/schema diff、production audit与diff check全部通过。
- **后续事项**：本地与CI门禁通过后，只允许重新部署 staging 并由主 Agent 复跑真实5轮探针；不得直接改产品 Worker 或推 production。

## 新 Bug 模板

复制以下内容到“详细记录”末尾，并在“问题索引”增加一行：

```markdown
### BUG-YYYYMMDD-NNN：问题标题

- **发现日期**：YYYY-MM-DD
- **严重程度**：S0 / S1 / S2 / S3
- **状态**：OPEN
- **影响范围**：
- **现象**：
- **复现条件**：
- **原因**：待调查
- **修复**：待处理
- **验证**：待验证
- **后续事项**：
```
