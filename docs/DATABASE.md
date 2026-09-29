# DATABASE.md

## 数据库设计原则

第一版只保存必要数据：用户、邀请码、商家项目。

不保存生成历史，不保存长期 ScriptDraft Session。

## Entity: User

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string / uuid | 用户 ID |
| account | string | 登录账号，唯一 |
| passwordHash | string | 密码哈希 |
| inviteCodeUsed | string | 注册时使用的邀请码 |
| createdAt | datetime | 创建时间 |

约束：

- account 必须唯一。
- passwordHash 不能存明文。
- inviteCodeUsed 必须来自 InviteCode.code。
- 用户只能访问自己的 Project。

## Entity: InviteCode

| 字段 | 类型 | 说明 |
|---|---|---|
| code | string | 邀请码，主键或唯一 |
| status | enum | unused / used / disabled |
| usedByUserId | string / nullable | 使用者用户 ID |
| usedAt | datetime / nullable | 使用时间 |

约束：

- status = unused 才能注册。
- 注册成功后，邀请码状态更新为 used。
- status = used 或 disabled 时，注册必须失败。
- 邀请码更新和用户创建必须在同一个事务中完成，避免并发重复注册。

## Entity: Project

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string / uuid | 项目 ID |
| userId | string | 所属用户 ID |
| projectName | string | 项目名称 |
| profileText | text | 商家资料大文本框 |
| createdAt | datetime | 创建时间 |
| updatedAt | datetime | 更新时间 |

约束：

- Project 必须归属于某个 User。
- 用户只能查看、编辑、删除自己的 Project。
- 生成脚本时必须读取 Project.profileText 的最新数据库值。
- profileText 不做复杂字段拆分。
- 建议第一版创建项目时要求 profileText 非空。

## ScriptDraft Session

页面内临时状态，不长期保存数据库。

包含内容：当前选择的 projectId、当前抖音链接、自动提取的原口播文案、参考脚本结构拆解、脚本时长、完整新口播脚本文案。

约束：不写入长期历史记录表；用户离开页面后不保证保留；页面刷新后是否保留由前端状态策略决定，第一版不强制要求。

## Prisma Schema 建议

```prisma
model User {
  id             String    @id @default(cuid())
  account        String    @unique
  passwordHash   String
  inviteCodeUsed String
  createdAt      DateTime  @default(now())

  projects       Project[]
}

model InviteCode {
  code         String           @id
  status       InviteCodeStatus @default(unused)
  usedByUserId String?
  usedAt       DateTime?
}

model Project {
  id          String   @id @default(cuid())
  userId      String
  projectName String
  profileText String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

enum InviteCodeStatus {
  unused
  used
  disabled
}
```

## V2 爆款选题额度（实施中，尚未上线）

- `User.dailyTopicLimit Int @default(5)`：每账号每日成功生成上限，后台可调整。
- `DailyUsage.topicIdeasGenerated Int @default(0)`：按现有上海时区日桶统计完整成功的25宫格 + Top 3次数。

分析商家资料不计数；只有完整生成且校验通过后，才把结果、`quotaChargedAt` 与用量递增写入同一个 Serializable 事务。失败、超时、非法结构或不足25条不扣额度；并发请求必须通过数据库事务避免超额。

`TopicGenerationJob` 是短期运行态队列，不是历史记录。它使用独立状态枚举（含用户取消终态 `canceled`）、`(userId, clientRequestId)` 唯一约束、Worker 锁和有限重试；只临时保存赛道/维度及完整成功结果，不保存商家正文、Prompt 或供应商原始响应。`runDeadlineAt` 是确定的总运行截止时间，超时任务失败并释放锁；`expiresAt` 只负责终态记录保留和清理。结果首次由所属用户读取后清空输入和结果，终态任务到期后删除。
