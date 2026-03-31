# 微信好友视频配音 PK（MVP 后端）

这是一个用于“视频配音 + 好友 PK + 排行榜”的最小可用后端示例，便于你快速对接微信小程序前端。

## 已实现功能

- 视频列表与详情（包含分句字幕）
- 逐句配音提交（用文本相似度模拟评分）
- 个人最佳分刷新与视频排行榜
- PK 邀请创建与分享码加入

> 当前为 MVP：数据采用内存存储，重启服务后会重置。

## 目录结构

- `docs/mvp-design.md`：产品与技术设计说明
- `app/main.py`：FastAPI 应用与业务逻辑
- `tests/test_api.py`：接口测试
- `miniapp/`：微信小程序前端 MVP（页面与 API 调用示例）
- `requirements.txt`：依赖列表

## 快速启动

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

启动后访问：

- Swagger 文档：`http://127.0.0.1:8000/docs`
- 健康检查：`GET /health`

## 核心 API

- `GET /videos`：视频列表
- `GET /videos/{video_id}`：视频详情（含字幕）
- `GET /videos/{video_id}/leaderboard`：视频排行榜
- `POST /dubbings/audio-lines/upload`：上传单句录音，返回模拟 ASR 文本与单句分数
- `POST /dubbings/submit`：提交配音并评分
- `POST /dubbings/render`：合成用户当前视频的配音成片
- `GET /dubbings/render/{render_id}/download`：下载合成后视频
- `POST /pk/invitations`：创建 PK 邀请
- `GET /pk/invitations/{share_code}`：查询邀请码详情（用于分享落地页展示）
- `POST /pk/invitations/{share_code}/join`：通过分享码加入 PK

## 微信小程序前端（MVP）

### 1) 导入项目

使用微信开发者工具导入 `miniapp/` 目录。

> `miniapp/project.config.json` 已提供开发配置，默认 `appid` 为 `touristappid`（仅示例）。

### 2) 配置后端地址（重点）

现在支持在小程序首页直接配置后端地址，无需改代码：

- 进入 `pages/videos/index`（视频列表页）
- 在“后端地址”输入框填写后端地址
- 点击“保存地址”并点“检测连接”

> 真机调试必须使用 **公网可访问 HTTPS 地址**，`http://127.0.0.1:8000` 在手机上不可达。  
> 同时请在微信公众平台的小程序后台把该域名加入 **request/uploadFile 合法域名**。

> 诊断建议：在 `pages/videos/index` 点击“**一键网络诊断**”，可分别检测  
> `request` / `uploadFile` / `downloadFile` 三条链路，快速定位具体失败项。

### 3) 页面说明

- `pages/videos/index`：视频列表入口
- `pages/video-detail/index`：逐句录音上传识别、提交评分、发起 PK 邀请
- `pages/leaderboard/index`：排行榜
- `pages/pk-join/index`：通过分享码加入 PK

### 4) 语音模式说明（当前为模拟 ASR）

- 小程序在视频详情页按句录音并上传文件到后端；
- 后端 `POST /dubbings/audio-lines/upload` 返回该句的模拟转写文本与即时分数；
- 客户端收集每句识别文本后，再调用 `POST /dubbings/submit` 计算最终总分与排名。

### 5) 分享与 PK 邀请

- 在配音页点击“发起PK”可生成分享码；
- 点击“分享PK”可使用微信原生转发，把挑战发给好友或群；
- 被分享者打开后进入 `pages/pk-join/index?shareCode=...`，可直接查看邀请并加入 PK。

### 6) 配音视频合成（MVP）

- 在配音页完成每句录音上传后，点击“合成配音视频”；
- 后端调用 ffmpeg 将每句录音按字幕时间轴混音并封装到原视频；
- 返回可下载地址（`/dubbings/render/{render_id}/download`），小程序可直接预览。

## 0 域名、免费、10 分钟真机跑通（Cloudflare Tunnel）

> 适合开发验证，不需要购买域名。会得到一个临时 `https://*.trycloudflare.com` 地址。

### 1) 启动后端（监听所有网卡）

```bash
cd /workspace
python3 -m pip install --user -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 2) 开一个新终端，安装并启动 cloudflared

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
./cloudflared tunnel --url http://localhost:8000
```

启动后会看到类似：

`https://xxxx-xxxx.trycloudflare.com`

### 3) 微信开发者工具/真机里配置后端地址

- 进入小程序 `pages/videos/index`
- 后端地址填：`https://xxxx-xxxx.trycloudflare.com`
- 点“保存地址” -> “检测连接”
- 成功后即可真机完整跑通（列表、录音上传、评分、PK、合成视频）

## 固定免费域名方案（Render）

仓库已内置部署文件：

- `Dockerfile`（包含 ffmpeg，支持配音视频合成）
- `render.yaml`（Render Blueprint）
- `.dockerignore`（减少构建上下文）

### 一键部署步骤

1. 打开 [render.com](https://render.com) 并登录；
2. 选择 **New +** -> **Blueprint**；
3. 连接你的 GitHub 仓库并选择本仓库；
4. Render 会识别 `render.yaml`，确认创建服务；
5. 部署完成后得到固定域名，例如：`https://pkqupeiyin-api.onrender.com`；
6. 在小程序 `pages/videos/index` 中填入该地址并“保存地址 + 检测连接”。

### 微信小程序后台域名配置

将 Render 域名加入：

- request 合法域名
- uploadFile 合法域名
- downloadFile 合法域名

## 运行测试

```bash
pytest -q
```

## 下一步建议

1. 接入微信登录（openid）与服务端鉴权；
2. 将评分从文本相似度升级为语音模型打分；
3. 将内存存储替换为 MySQL + Redis；
4. 增加好友榜/群榜、赛季榜等运营玩法。