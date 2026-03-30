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
- `POST /pk/invitations`：创建 PK 邀请
- `POST /pk/invitations/{share_code}/join`：通过分享码加入 PK

## 微信小程序前端（MVP）

### 1) 导入项目

使用微信开发者工具导入 `miniapp/` 目录。

> `miniapp/project.config.json` 已提供开发配置，默认 `appid` 为 `touristappid`（仅示例）。

### 2) 配置后端地址

编辑 `miniapp/app.js`：

```js
App({
  globalData: {
    baseUrl: 'http://127.0.0.1:8000'
  }
});
```

如果你在真机调试，需要改为可访问的后端地址（如内网穿透地址）。

### 3) 页面说明

- `pages/videos/index`：视频列表入口
- `pages/video-detail/index`：逐句录音上传识别、提交评分、发起 PK 邀请
- `pages/leaderboard/index`：排行榜
- `pages/pk-join/index`：通过分享码加入 PK

### 4) 语音模式说明（当前为模拟 ASR）

- 小程序在视频详情页按句录音并上传文件到后端；
- 后端 `POST /dubbings/audio-lines/upload` 返回该句的模拟转写文本与即时分数；
- 客户端收集每句识别文本后，再调用 `POST /dubbings/submit` 计算最终总分与排名。

## 运行测试

```bash
pytest -q
```

## 下一步建议

1. 接入微信登录（openid）与服务端鉴权；
2. 将评分从文本相似度升级为语音模型打分；
3. 将内存存储替换为 MySQL + Redis；
4. 增加好友榜/群榜、赛季榜等运营玩法。