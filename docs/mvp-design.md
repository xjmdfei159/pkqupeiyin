# 微信好友视频配音 PK 小程序（MVP 设计）

## 1. 产品目标

构建一个可用的最小闭环版本，支持：

1. 用户浏览可配音视频并选择作品；
2. 用户按字幕逐句配音并获得系统评分；
3. 用户将作品分享到好友/群，好友可加入 PK；
4. 每个视频维持实时排行榜，用户重复挑战后可刷新排名。

## 2. 核心业务流程

### 2.1 配音流程

1. 用户进入视频详情页，拉取字幕分句数据；
2. 用户按句录音，客户端进行音频上传；
3. 服务端执行打分逻辑并返回每句分值与总分；
4. 作品入库（包含分句分数、总分、时间）；
5. 如果总分超过用户在该视频的历史最佳成绩，刷新排行榜。

### 2.2 PK 流程

1. 用户在视频页发起 PK 邀请；
2. 服务端生成分享码（share code）；
3. 好友通过分享码进入并加入 PK；
4. 所有参与者都在同一个视频维度下竞争；
5. 排行榜按“用户在该视频的历史最高分”排序。

### 2.3 排行榜刷新规则

- 粒度：`video_id` 维度；
- 数据口径：每个用户只保留该视频的**最高分**；
- 更新时机：每次提交配音后实时重算该用户最佳分；
- 排序规则：
  1. 分数降序；
  2. 分数相同则最近达到该成绩时间更早者优先；
  3. 再相同按 `user_id` 字典序。

## 3. MVP 评分策略（可迭代）

MVP 阶段采用文本相似度打分，便于快速上线验证流程：

1. 每句字幕有标准文本 `expected_text`；
2. 客户端可上传 ASR 识别文本 `spoken_text`；
3. 服务端使用字符串相似度（`difflib.SequenceMatcher`）计算每句分数；
4. 每句分数范围 0-100，总分为所有句子平均值（保留 2 位小数）。

后续可升级为“音色 + 情绪 + 节奏 + 停顿 + 对口型”多维模型。

## 4. 系统架构（MVP）

- **客户端**：微信小程序（录音、播放、分享、排行榜展示）
- **服务端 API**：FastAPI（本仓库示例）
- **数据层**：MVP 采用内存存储（便于演示），生产建议 MySQL + Redis
- **对象存储**：腾讯云 COS（音频/视频素材）
- **异步任务**：可选队列（后续接入 AI 打分模型）

## 5. 数据模型（逻辑）

1. `Video`
   - `video_id`
   - `title`
   - `description`
   - `subtitles[]`（line_id、expected_text、start_ms、end_ms）

2. `DubbingAttempt`
   - `attempt_id`
   - `user_id`
   - `video_id`
   - `line_results[]`（line_id、spoken_text、score）
   - `total_score`
   - `created_at`

3. `LeaderboardEntry`
   - `video_id`
   - `user_id`
   - `best_score`
   - `best_attempt_id`
   - `updated_at`

4. `PkInvitation`
   - `invitation_id`
   - `video_id`
   - `inviter_user_id`
   - `share_code`
   - `participants[]`
   - `created_at`

## 6. API 规划（MVP）

### 视频相关

- `GET /videos`：视频列表
- `GET /videos/{video_id}`：视频详情（含字幕）
- `GET /videos/{video_id}/leaderboard`：视频排行榜

### 配音与评分

- `POST /dubbings/submit`：提交逐句文本并评分，返回总分与是否刷新个人最佳

### PK 相关

- `POST /pk/invitations`：创建 PK 邀请，返回分享码
- `POST /pk/invitations/{share_code}/join`：通过分享码加入 PK

## 7. 生产化建议（下一步）

1. 鉴权：接入微信登录（`openid/unionid`）和服务端 JWT；
2. 评分引擎：引入语音质量模型与情感表达模型；
3. 并发优化：排行榜读写分离，热榜缓存；
4. 风控：刷分检测（频率、设备指纹、异常分布）；
5. 运营：按视频设置赛季榜、周榜、好友榜。
