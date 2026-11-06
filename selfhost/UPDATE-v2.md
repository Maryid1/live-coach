# 在场自部署 v2 更新与验收

2026-11-05。此说明优先于旧版 README 和 Sites 使用说明。

## 已实现

- 手机/窄屏布局、配置状态、HTTP 麦克风说明。
- 本机收藏最多 20 段读稿，刷新恢复、载入、删除。不会跨手机同步，清除浏览器数据会丢失。
- 百炼联网问答服务端接口：三种答法、搜索来源、异常保留原稿、超时和单任务并发限制。
- 配置 AI 后可自定义暖场话题，在工作台确认后生成三个版本。

真实百炼连接尚需配置与实测；模拟接口测试不是实际联网验收。搜索来源也不代表逐句事实已验证。
当前 HTTP 网页不能开启麦克风，可尝试手机输入法语音转文字。直接网页语音还需 HTTPS 和语音服务。
形象/状态仍是定时提醒，口播风险只检查稿件，不监听实际直播。平台规则仍需人工核对。

## 1. 上传并备份

Workbench 上传新包到 `/home/admin/live-coach-selfhost.tar.gz`。
以下均在 **阿里云远程终端** 执行，不在本机 PowerShell 执行。

```sh
cd /home/admin/live-coach-test
umask 077
backup="/home/admin/live-coach-backup-$(date +%Y%m%d-%H%M%S)"
mkdir "$backup"
cp -a . "$backup/"
printf 'Backup: %s\n' "$backup"
```

作用：进入部署目录，限制新建文件权限，将旧程序、端口配置、`.env` 备份到带时间目录。记下输出目录用于回滚；备份包含密码，不要公开。不会停止网站。

## 2. 更新但保留密码和端口

```sh
tar -xzf /home/admin/live-coach-selfhost.tar.gz -C /home/admin/live-coach-test --exclude='./compose.yaml' --exclude='./.env'
sudo docker compose config --quiet
sudo docker compose up -d --build
sudo docker compose ps
```

作用：解压新版前端、服务器和 Dockerfile，但保留当前 compose.yaml 的 `0.0.0.0:3000:3000` 与原密码。随后检查语法、重建并后台启动、查看状态。可能短暂中断。此步骤不启用 AI 付费调用。

浏览器刷新应显示“自部署测试版 · v2”。测试原密码、内置回答、收藏后刷新、手机布局。失败时保留错误信息，不要删除目录或重置密码。

## 3. 可选配置百炼 AI

官方接口依据：https://help.aliyun.com/zh/model-studio/web-search
模型和搜索可能收费，先核对百炼控制台额度与账单。没有配置不会调用。不要把 API Key 发到聊天、截图或公开网页。

用服务器文件编辑器在原 `.env` 末尾添加：

```dotenv
DASHSCOPE_API_KEY=填写自己的密钥
DASHSCOPE_BASE_URL=填写控制台给出的HTTPS兼容BaseURL
DASHSCOPE_MODEL=填写支持联网搜索的模型名称
```

密钥和地址必须对应同一地域/业务空间。Base URL 通常以 `/compatible-mode/v1` 结尾，不含 `/chat/completions`；本适配器只接受 HTTPS `*.aliyuncs.com`。

在 **现有 compose.yaml** 的 `environment:` 内添加以下三行，和 APP_USER 同级缩进；不要替换现有端口或密码：

```yaml
      DASHSCOPE_API_KEY: ${DASHSCOPE_API_KEY:-}
      DASHSCOPE_BASE_URL: ${DASHSCOPE_BASE_URL:-}
      DASHSCOPE_MODEL: ${DASHSCOPE_MODEL:-}
```

```sh
cd /home/admin/live-coach-test
sudo docker compose config --quiet
sudo docker compose up -d --force-recreate
```

作用：检查配置并重新创建容器，读取新环境变量。不要截图不带 `--quiet` 的 config 输出，它可能显示密钥。
刷新网页，开启“联网查证”，确认发送，再生成一次并检查来源。显示“已配置”只检查字段存在，不保证权限、余额或网络正常。

## 回滚

从第 1 步记录的备份目录复制内容回 `/home/admin/live-coach-test`，在部署目录运行 `sudo docker compose up -d --build`，作用是用旧程序重建容器。不删除其他目录，不确定备份路径时先联系维护者。

## 仍待后续完善

- 百炼真实调用与手机实测：待服务器配置。
- 网页直接语音识别：待 HTTPS 与国内可用语音服务。
- 摄像头自动形象分析、实际口播监听风险：未实现。
- 官方规则自动更新、跨设备同步、独立多用户账号：未实现。

包内 compose.yaml 仍是新装默认回环地址；现有公网实例按上述排除方式保留原配置。HTTP 登录凭据和内容未加密，本次按测试需求保留，不代表安全加密访问。
