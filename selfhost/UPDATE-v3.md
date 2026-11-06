# v3：DeepSeek 官方接入

本版保留百炼，增加 DeepSeek 官方 Chat Completions。AI_PROVIDER 控制当前服务商（默认 bailian）。不会自动回退或同时调用多家。尚未提供网页服务商切换、第三方自定义地址。

DeepSeek 仅生成三种答法及自定义暖场稿，明确显示“未联网”，不展示搜索来源。本次未接入其独立搜索服务，并非断言官方没有搜索能力。

## 更新程序

在 Workbench 上传新版 live-coach-selfhost.tar.gz 到 /home/admin/，按 UPDATE-v2.md 先备份，再解压（排除 compose.yaml 和 .env），运行 docker compose up -d --build。浏览器应显示 v3。保留现有账号和公网端口。

## 配置 DeepSeek

用 Workbench 文件编辑器打开 `/home/admin/live-coach-test/.env`，添加以下配置；已有同名字段则修改，不要重复添加：

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=在服务器填写自己的DeepSeek官方密钥
DEEPSEEK_MODEL=deepseek-flash
```

这里是配置内容，不是终端命令。不要发送密钥或截图。模型名称以账号可用模型为准；deepseek-flash 为 2026-11-05 官方文档示例，非免费承诺。调用前核对余额和费用。

编辑现有 `compose.yaml`，在 `environment:` 下新增这三行，和 APP_USER 同级缩进；不要改动原来的账号、密码、ports 和百炼配置：

```yaml
      AI_PROVIDER: ${AI_PROVIDER:-bailian}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
      DEEPSEEK_MODEL: ${DEEPSEEK_MODEL:-}
```

在阿里云远程终端执行：

```sh
cd /home/admin/live-coach-test
sudo docker compose config --quiet && sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=30 web
```

解释：cd 进入目录；config --quiet 检查配置而不打印密钥；检查成功才构建并重建容器，读取新的配置；ps 显示状态；logs 显示最近启动日志。网站可能短暂中断。

刷新后应显示 DeepSeek（未联网）。打开 AI 开关，确认发送范围，输入问题并点击“AI 生成 3 种答法（未联网）”。成功得到三段答法才算真实接入通过。“已配置”只代表字段存在。

密钥错误、余额不足或模型无权限时保留原稿并提示，不自动切换百炼。改回 AI_PROVIDER=bailian 并重新运行上述部署命令可使用原百炼配置。

## 验证边界

本机只运行模拟测试，不调用真实付费 API。服务器配置、真实模型调用、安卓实测需部署后完成。

官方依据：https://api-docs.deepseek.com/ 和 https://api-docs.deepseek.com/guides/json_mode/
