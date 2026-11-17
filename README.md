# 小吴小王的幸福生活

只属于两个人的 Todoist 风格计划表。纯 Node.js，无运行时依赖；数据保存在自己的服务器上。

- 站点：<https://hy.azraelkaxi.top>
- 账号：`hy`（密码单独保存，不在仓库里）
- 仓库：<https://github.com/Azraelkaxi/hy-happy-life>

## 功能

- 添加任务，自动识别「明天 19:00」「周末」「下周三」等时间写法
- 上下拖动即调整优先级，越靠上越重要
- 点时间标签随时改期、清空时间
- 勾选完成，已完成单独归档，可一键恢复或清空
- 任务备注、搜索、今天 / 计划 / 全部 / 已完成四个视图
- 设置「在一起的纪念日」，显示在一起第几天
- 桌面侧栏 + 手机底部导航，适配 H5
- 单账号登录，scrypt 密码哈希 + HMAC 签名会话 Cookie，接口有限流

## 本地运行

```bash
cd hy-happy-life
npm run hash-password -- '你的密码'   # 生成 AUTH_PASSWORD_HASH
cp .env.example .env                  # 填入哈希和 SESSION_SECRET
npm start                             # http://127.0.0.1:3210
```

需要 Node 20 以上（服务器实测 Node 22）。

`.env` 说明：

| 变量 | 说明 |
|---|---|
| `PORT` | 监听端口，默认 `3210` |
| `HOST` | 监听地址，生产固定 `127.0.0.1` |
| `AUTH_USER` | 登录账号，`hy` |
| `AUTH_PASSWORD_HASH` | `npm run hash-password` 生成的 scrypt 哈希 |
| `SESSION_SECRET` | 会话签名密钥，至少 16 位随机串 |
| `DATA_DIR` | 数据目录，生产为 `/www/apps/hy-happy-life/data` |
| `COOKIE_SECURE` | `auto` 跟随协议；HTTPS 稳定后可设 `true` |
| `SESSION_DAYS` | 登录有效期天数，默认 30 |

数据落在 `DATA_DIR/tasks.json`，写入为原子替换，并按天备份到 `DATA_DIR/backups/`。

## 冒烟测试

先启动服务，再执行：

```bash
node scripts/smoke.mjs
```

默认测 `http://127.0.0.1:3210`，可用 `BASE_URL` 覆盖。测试会创建并清理自己的任务。

## 部署

服务器目录：

```
/www/apps/hy-happy-life/
  app/     # 代码（覆盖更新）
  data/    # 任务数据、备份、ACME 验证目录（不要覆盖）
  logs/    # 应用与 Nginx 日志
  .env     # 生产环境变量（不进 Git）
```

Nginx 反代 `127.0.0.1:3210`，配置模板在 `deploy/`：

- `hy-happy-life.http.conf`：首次部署、证书未就绪时使用
- `hy-happy-life.conf`：证书就绪后的 80 跳 443 + 443 反代
- `hy-happy-life.service`：systemd 单元，以 `www` 用户运行

详细步骤见工作区 `notes/hy-happy-life.md`。

## 目录

```
server/    HTTP 服务、路由、存储、认证
public/    原生 HTML / CSS / JS 前端
deploy/    Nginx 与 systemd 配置
scripts/   密码哈希、冒烟测试
```
