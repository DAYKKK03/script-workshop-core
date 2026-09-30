# 定制化脚本设计规格

## 状态

设计已确认。阶段 1 写作规则与契约文档、阶段 2 静态页面、阶段 3 本地 API/数据库/Worker/AI 服务/额度和真实页面接入已实现；staging migration、真实 DeepSeek、20组事实边界与外部域名页面验收尚未执行。本文档是定制化脚本页面、接口、AI 生成和验收的产品事实来源；写作细则见 [`CUSTOM_SCRIPT_WRITING_RULES.md`](./CUSTOM_SCRIPT_WRITING_RULES.md)。

真实登录入口为 `/custom-scripts`，仅读取当前用户项目名称并通过持久任务 API 生成；商家正文始终由 Worker 按归属重新读取，不进入浏览器。`/custom-scripts/preview` 只用于开发环境固定样本视觉验收，生产环境必须返回 404。

阶段 2 响应式验收截图保存在 `docs/assets/custom-scripts-static-1280.png`、`custom-scripts-static-1440.png`、`custom-scripts-static-375.png` 和 `custom-scripts-static-390.png`。

## 设计理由

现有参考脚本功能解决“有对标视频时怎么改写”，爆款选题解决“拍什么”。定制化脚本补齐“用户已经知道想拍什么，直接得到可口播成稿”的路径，并允许把爆款选题复制进来继续创作。单页单结果比模板库、历史库或编辑器更符合当前轻量工具定位。

## 设计优点

- 同时承接自由描述、普通爆款选题和 Top 3，不增加三套页面。
- 服务端始终读取当前商家最新资料，避免浏览器缓存商家正文成为事实来源。
- 持久异步任务跨越网关等待边界；每个任务最多两次受控语义调用，成本和最长运行时间都可计算。
- 来源项目 ID 校验、幂等和单任务约束降低串商家、重复生成与重复扣额风险；项目名称只用于展示。

## 一、用户流程

```text
选择商家项目
→ 输入脚本需求或粘贴爆款选题方案
→ 确认内容目标和表达风格
→ AI读取商家最新资料
→ 生成完整口播（创作目标约200—350字）
→ 复制或换一版
```

登录保护页面为 `/custom-scripts`，侧栏“定制化脚本”由占位项改为真实导航。没有项目时引导用户先创建商家项目。

## 二、页面布局

业务页延续暗色玻璃、橙色主操作和克制动效，桌面与移动均采用上下单列。

### 创作设置面板

1. **商家项目**：显示当前用户自己的项目名称，默认选择第一个可用项目。
2. **创作要求**：最多 5000 个规范化 Unicode code points 的大文本框，可输入自由需求或粘贴爆款选题文本。输入框不使用原生 `maxlength`，避免浏览器按 UTF-16 code units 提前截断 emoji 等非 BMP 字符；受控输入先完整接收，再使用共享规范化计数显示字数。超过 5000 时保留原文、显示错误并禁用生成。
3. **识别提示**：前端仅用确定性文本规则显示 `自由创作需求`、`爆款选题方案` 或 `Top 3 优先拍方案`，不为分类调用 AI。
4. **内容目标**：`自动判断 / 引流 / 信任 / 转化`。官方选题头存在时先用机器字段 `sourceObjective` 初始化，之后用户仍可修改实际 `objective`；来源目标与最终创作目标是两个独立字段。
5. **表达风格**：`自动判断 / 自然聊天 / 专业可信 / 情绪共鸣`。
6. **主操作**：`生成完整口播脚本`。

占位文案：`例如：写一条面向附近上班族的下午茶口播，突出当天现做，语气像朋友推荐。也可以粘贴爆款选题方案。`

### 选题来源与防串项目

- 爆款选题“复制方案”使用下列稳定头部；普通选题与 Top 3 均一致，其余选题正文从第六行开始：

```text
【脚本工坊爆款选题】
sourceProjectId: <项目ID>
sourceType: <topic|top_pick>
sourceObjective: <auto|traffic|trust|conversion>
商家项目：<项目名称>
```

- 从首个非空行开始的五行是完整官方头；其前只允许由 Unicode `White_Space` 或 FEFF 组成的空白行。机器字段必须完整、单行、区分大小写并严格按顺序各出现一次；`sourceType=topic` 时 `sourceObjective` 必须为 `auto`，`sourceType=top_pick` 时必须为 `traffic|trust|conversion`。标识或保留字段出现在前置空白区时仍视为恶意错位并拒绝。
- 项目名称只供用户辨认，不能用于安全判断；复制时将 CR、LF、U+2028、U+2029 全部替换为空格，再把连续 Unicode whitespace 收敛为单个 ASCII 空格并 trim，防止名称伪造机器字段行。
- 定制页解析官方头后，将 `sourceProjectId`、`sourceType` 和 `sourceObjective` 作为来源字段提交，不允许用当前项目或中文标签覆盖来源值。Top 3 来源目标只认机器字段 `sourceObjective`，不从中文标签猜测。
- `sourceObjective` 只用于验证来源并初始化界面；首次识别或切换到另一合法来源时，普通 `topic` 把界面目标重置为 `auto`，Top 3 使用其 `traffic|trust|conversion`。用户随后可以修改实际生成字段 `objective`，编辑同一来源正文或修改其他条件不得覆盖该手动选择；服务端不得要求 `objective === sourceObjective`。
- 服务端必须从 `requestText` 独立解析官方头，并与 body 的 `sourceProjectId`、`sourceType`、`sourceObjective` 逐项交叉核对，不能信任前端解析结果；实际 `objective` 不参与官方头交叉核对。
- 服务端必须确认 `sourceProjectId` 属于当前登录用户且严格等于所选 `projectId`。不存在、无权访问或不相等统一阻止生成并提示切换正确项目，不泄露项目是否属于其他账号。
- 官方标识或保留机器字段 `sourceProjectId:`、`sourceType:`、`sourceObjective:` 只允许出现在正确五行头的对应位置；它们出现在正文或其他位置一律作为无效输入。
- 只有全文完全不含官方标识和三个保留机器字段时，才作为旧版或外部文本继续，并显示：`未识别来源项目，将以当前选择的商家资料为准。`
- 官方头存在但字段为空、缺失、重复、非法、顺序错误、交叉核对不一致或项目展示行缺失时，统一作为无效输入阻止生成，不能降级为“无来源”。
- 输入识别只改善交互，不是安全边界；服务端仍需校验项目归属并只读取当前项目资料。

### 结果面板

- 初始空态：`填写创作要求后即可生成。目标约200—350字，实际以完整口播为准。`
- 生成中只显示真实加载状态，不显示虚假百分比。
- 成功后展示完整口播、实际字数、`复制完整脚本` 和 `换一版`。
- 同一页面会话内保留生成条件时可直接“换一版”；刷新后恢复到成功结果时不会伪造或恢复旧输入条件，页面明确提示原生成条件已清理，并要求重新填写后生成新版本。
- 正文只读并保留自然段落与换行；不展示标题、分镜、时间轴、结构分析或 AI 推理。
- 页面提示：`结果仅临时保留30分钟且不进入历史，请及时复制。`
- 修改项目、要求、目标或风格后清空旧结果，避免旧结果与新条件错配。
- 移动端控件与按钮单列并占满可用宽度。
- 开启 `prefers-reduced-motion: reduce` 时，加载图标停止旋转，定制化脚本的非必要过渡关闭；静态状态和文字仍完整可理解。

## 三、输入、生成与结果契约

生成请求的业务字段固定为：

```json
{
  "clientRequestId": "uuid",
  "projectId": "project-id",
  "sourceProjectId": "粘贴选题携带时传入；自由需求或旧版无ID选题不传",
  "sourceType": "topic | top_pick；自由需求或旧版无官方头不传",
  "sourceObjective": "auto | traffic | trust | conversion；自由需求或旧版无官方头不传",
  "requestText": "用户需求或选题方案",
  "objective": "auto | traffic | trust | conversion",
  "tone": "auto | natural | professional | emotional",
  "previousScript": "换一版时传入，首次不传"
}
```

AI 领域结果只允许两种：

```json
{
  "status": "success",
  "finalScript": "完整口播正文（创作目标约200—350字）"
}
```

```json
{
  "status": "needs_profile",
  "missingFacts": ["main_product", "core_selling_point"]
}
```

服务端在信任边界校验登录、`projectId` 归属、来源官方头与 body 一致性、可选 `sourceProjectId` 归属与等值、输入长度、枚举和 UUID；每次请求重新读取商家最新 `profileText`。浏览器不提交、缓存或持久化商家正文。

字段边界按 Unicode code points 计算：`requestText` 去除首尾 Unicode whitespace 后为 5—5000；`previousScript` 可选且最多1000；`sourceProjectId` 可选且最多64。规范化统一复用 `lib/custom-scripts/text.ts`：依次执行 NFC、CRLF/CR→LF 和边界 trim。边界 trim 明确兼容 ECMAScript 语义并去除 FEFF；正文计数只移除 Unicode `White_Space`，内部 FEFF 不属于该属性并按1个 code point 计入。`objective` 与 `tone` 只接受契约枚举。`missingFacts` 只能是固定缺失资料码中的1—5个唯一值，前端本地映射中文，不能展示 AI 自由文本。

固定缺失资料码共18项，唯一中文映射为：`main_product`→主营产品、`core_selling_point`→核心卖点、`target_audience`→目标人群、`consumption_scene`→消费场景、`price`→价格、`promotion`→活动、`address_or_service_area`→地址或服务区域、`service_process`→服务流程、`qualification`→资质、`proof_or_case`→证据或案例、`effect_claim`→效果依据、`production_process`→生产或制作流程、`materials_or_ingredients`→材料、原料或成分、`service_action`→服务动作、`business_hours`→营业时间、`contact_method`→联系方式、`business_data`→经营数据、`warranty_or_after_sales`→质保或售后。模型只返回 code；服务端执行白名单校验，前端只使用本地映射展示中文。

定制化脚本所有成功 API 响应统一使用 `{ "success": true, "data": ... }` 包装。

## 四、AI 与成本策略

- 模型读取 `DEEPSEEK_MODEL`，本功能目标配置为 `deepseek-v4-flash`，请求显式关闭思考模式。
- Prompt 固定顺序：系统安全与输出契约 → 商家最新资料 → 压缩写作规则 → 目标/风格/用户要求。商家资料和用户输入通过 `JSON.stringify` 或等价安全 JSON 序列化放入用户消息，禁止拼接可由输入闭合的 XML/伪标签边界。
- 每个语义请求显式设置 Provider `maxAttempts=1` 并禁用 envelope retry/嵌套传输重试。语义尝试最多2次：首次调用，以及空响应、非法 JSON、领域校验失败或首次安全稿落在80—199时的一次针对性尝试；总 Provider 调用最多2次。
- 连续两次 `empty_content`（HTTP/JSON envelope 成功但模型 `content` 为空）最终固定为 `CUSTOM_SCRIPT_OUTPUT_INVALID`。只有网络错误、Provider 请求超时或 HTTP 失败归类为 `CUSTOM_SCRIPT_PROVIDER_UNAVAILABLE`；Job 到达120秒 `runDeadlineAt` 则保持 `CUSTOM_SCRIPT_RUN_TIMEOUT`。
- 两次语义尝试共享任务120秒 run deadline；每次 Provider 请求使用任务剩余预算，剩余预算不足时不再发起调用。
- 不对输入分类额外调用 AI，不在运行时读取外部 Markdown，不发送完整方法论文档或完整案例集；运行时只携带压缩规则和短小的去标识化正反例。
- Prompt允许低风险通用行业知识补充原因解释、判断标准、可执行方法、适用边界或风险提醒，但不得把通用知识变成当前商家事实。服务端按整句逐个病名拒绝明确诊断，但允许真正的科普、问句、预防、不确定表达和咨询医生建议；问句豁免只限当前病名所在分句，不能放过同句后续明确诊断。医疗转介短语不计营销CTA，句尾补一句咨询医生仍不能洗白前面的明确诊断。商家高风险断言必须同时包含可信商家主体（固定主体、项目名称或去常见后缀后的品牌名）、肯定能力动词与紧随其后的高风险事实；单字“有”使用更短的2字事实间距，其他能力动词最多6字，普通提问、科普和否定能力表达不算能力断言。
- 输出必须先通过服务端本地校验。首次安全稿达到200—350时直接成功；首次安全稿处于80—199时，先把严格内部 `quality_fallback` shape写入 `CustomScriptGenerationJob.result`，再把剩余一次调用标记为fresh `quality_enrichment`。第二次Prompt不得接收首稿正文，processing公共API不得返回内部正文。
- `quality_enrichment` 若产生更好的安全稿则使用新稿；若第二次 Provider 失败、返回非法输出或 `needs_profile`，或第二稿更差，则使用持久fallback成功完成。增强调使用40秒总预留，覆盖30秒租约恢复窗口、Worker轮询、数据库余量和至少5秒成功事务；剩余时间不超过40秒时跳过增强。120秒hard deadline不变，deadline后仍进入timeout终态。
- 共用现有脚本生成额度 `dailyScriptLimit` / `scriptsGenerated`；首次生成和“换一版”每个成功任务只扣一次额度，质量尝试不重复扣额，失败不扣。
- 浏览器对一次未确认成功或失败的提交原子保留 `clientRequestId + 完整 draft + previousScript`；网络响应丢失时用完全相同的业务载荷重试。修改任一条件会清空该状态并创建新 UUID；每次已确认后的“换一版”同样创建新 UUID。服务端用 UUID 与完整输入哈希共同恢复同一任务，不允许同 UUID 对应不同条件。
- 完成事务返回 `completed | daily_limit | lease_lost` 三类内部结果，使 Worker 能分别记录成功、额度竞态失败和租约丢失，三者都保持“只有成功才扣额”的原子语义。
- 定制化脚本独立按用户每小时最多创建10个新任务；`needs_profile` 和失败任务也计入小时限制，幂等重放不重复计数。每日脚本额度仍只在成功时计数。
- POST 创建新 Job 前调用 `assertDailyScriptQuota` 做快速拒绝；Worker 成功事务内必须再次检查每日额度，防止并发任务或其他脚本功能在运行期间耗尽额度。

## 五、持久异步任务

固定使用 `CustomScriptGenerationJob` 与独立单副本 Worker。POST 只创建/恢复任务，页面轮询任务接口。页面 mount 时调用 `/api/scripts/generate-custom/current`，恢复当前用户最新且未过30分钟 TTL 的活动或终态任务。接口实现后仍须在 staging 外部域名用自由需求2次、普通选题2次、Top 3方案1次做性能验收，但耗时结果不再改变架构。

- 创建时固定 `runDeadlineAt = createdAt + 120s`；超过截止时间未成功必须进入超时终态。
- 终态保留最多30分钟，`expiresAt = finishedAt + 30min`；不提供历史列表，过期由 Worker 删除。
- 商家 `profileText` 只在 Worker 运行时按用户/项目重新读取，绝不写入 Job。
- Job 的输入字段在任何终态立即清空；成功正文或 `missingFacts` 结果最多保留30分钟供所属用户读取，首次读取不会延长 TTL。
- `(userId, clientRequestId)` 唯一，并保存不含明文正文的 `inputHash`。哈希输入的所有文本依次做 NFC、CRLF/CR→LF、trim，枚举保留合法原值；对固定数组 `[projectId,requestText,objective,tone,previousScript||'',sourceProjectId||'',sourceType||'',sourceObjective||'']` 执行 `JSON.stringify` 后取 SHA-256，`clientRequestId` 不参与。同 UUID 同 payload 返回原 Job；同 UUID 不同 payload 返回 HTTP 409 `CUSTOM_SCRIPT_IDEMPOTENCY_CONFLICT`。
- 每个用户最多一个 `queued|processing` 任务；创建与 Worker 完成的竞态必须由事务/条件更新保护。
- Job 持久化 `providerCallsStarted` 与 `semanticAttempt`。80—199首稿必须先在 `processing + lockedBy + deadline + providerCallsStarted=1` 条件下持久化合法 `quality_fallback`，再预留第二次调用。重领时 `providerCallsStarted=1` 可继续一次增强；`providerCallsStarted=2` 且fallback合法时不再调用Provider，直接走成功事务；没有合法fallback的耗尽任务保持原失败行为。
- Worker 锁超时30秒、每10秒心跳续租。新 Worker 只可重领失去心跳超过30秒的锁，并沿用已保存的调用计数；旧 Worker 失锁后，任何终态、结果或扣额条件更新都必须匹配锁 token 并失败。
- 成功结果、`quotaChargedAt` 与上海时区当日 `DailyUsage.scriptsGenerated + 1` 必须在同一个 Serializable 事务再次检查额度后提交；失败、超时、取消和 `needs_profile` 不扣每日额度。
- Job 只保存运行必要的输入、哈希、状态、锁、错误分类、时间戳和processing期间的内部 `quality_fallback`；取消、失败和其他终态必须清空它，成功则由正式结果替换。日志不得保存fallback正文、Prompt或模型原始响应。
- 用户可以取消 `queued|processing` 且尚未扣额的任务。取消与完成通过条件更新竞争，只有一个终态获胜；取消成功清空输入、结果和锁。页面生成中必须显示“取消生成”。

## 六、错误与日志

用户可见错误至少区分：输入无效、项目不存在/无权、来源项目不一致、资料不足、已有任务、额度不足、AI 超时/不可用、AI 输出不合格。

日志可以记录：脱敏用户/请求标识、耗时、输入/输出长度桶、Prompt/Completion Token 桶、缓存命中 Token 桶、重试原因、错误分类和是否扣额。

日志不得记录：商家正文、用户要求、粘贴选题、上一版正文、生成正文、Prompt、模型原始响应、密钥或明文用户/项目 ID。

## 七、能力边界

- 每次生成一条完整中文口播，支持复制和换一版；页面创作目标约200—350字，Prompt 仍以240—300字为目标，服务端内部安全范围为80—350。
- 支持自由需求、普通爆款选题和 Top 3 选题文本。
- 支持引流、信任、转化目标和三种明确表达风格。
- 只提供创作建议，不承诺播放量、爆款或经营效果。

## 八、限制说明

- 不从爆款选题页一键跳转，本期仅通过复制粘贴衔接。
- 不提供模板库、示例库、历史记录、站内编辑、批量生成或完整拍摄方案。
- 不生成标题、镜头、画面说明、发布时间或实时热点。
- `/current` 只返回当前用户最新且未过30分钟 TTL 的单个任务，可恢复 `queued|processing|succeeded|needs_profile|failed|canceled`，不返回列表；过期后不保证恢复，且不建设用户历史列表。
- 当前阶段只部署和验收 staging，未明确授权前不得推生产。

## 九、Staging 真实链路探针

- `.github/workflows/staging-custom-script-link-first-probe.yml` 只允许手动触发，并要求 staging 已部署 SHA 与工作流 SHA 完全一致。
- 探针只读固定测试商家的最新资料，直接复用 `requestCustomScriptAttempt`、80—350内部安全校验、120秒单轮截止和最多一次语义重试；不接入 prefixId 或 replacement repair。
- 探针不创建 `CustomScriptGenerationJob`，不写账号用量计数，也不扣每日脚本额度；Provider 请求在探针边界移除用量归属。
- 每轮只输出脱敏状态、调用次数、耗时与固定诊断桶；不输出商家资料、用户要求、Prompt、模型正文、项目/用户 ID 或密钥。五轮全部成功才返回 `gate=true`，任一失败立即停止以限制外部成本。
