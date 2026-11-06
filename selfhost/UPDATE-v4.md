# v4：ZSwing-Plus Responses

保留百炼和 DeepSeek。第三方固定使用 https://openai.zswing.net/v1/responses，通过 Responses input/instructions 发送，从 output 中读取 output_text。没有接入搜索、自动重试、密钥轮换或自动回退。服务商由服务器 AI_PROVIDER 选择，网页暂不提供切换。

## 更新程序

上传新版 live-coach-selfhost.tar.gz 到 /home/admin/。先按 UPDATE-v2.md 备份，再按其中排除 compose.yaml 和 .env 的方法解压。v4 包已经包含 v3，无需分别安装。保留原账号和公网端口。

## 配置（不是终端命令）

用 Workbench 编辑 `/home/admin/live-coach-test/.env`，添加或修改以下字段；不要重复写同名字段，不要删掉原 APP_USER、APP_PASSWORD：

```dotenv
AI_PROVIDER=zswing
ZSWING_API_KEY=在服务器填写当前有额度的第三方完整密钥
ZSWING_MODEL=gpt-6-astra
```

模型名来自用户的正常可用配置，不加 Magpie 的 zswing-plus/ 前缀。密钥不发聊天，不截图。调用可能产生第三方费用，额度以该平台为准。

编辑原 `compose.yaml`，在 `environment:` 下添加这些行，与 APP_USER 同级缩进。已有 AI_PROVIDER 则修改原行，不重复添加；不要更改 ports：

```yaml
      AI_PROVIDER: ${AI_PROVIDER:-bailian}
      ZSWING_API_KEY: ${ZSWING_API_KEY:-}
      ZSWING_MODEL: ${ZSWING_MODEL:-}
```

## 重建与验证（阿里云远程终端）

```sh
cd /home/admin/live-coach-test
sudo docker compose config --quiet && sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=30 web
```

cd 进入部署目录；config --quiet 检查配置但不输出密钥；成功才重建并后台启动容器；ps 检查状态；logs 查看最近日志。网站会短暂中断。不要截图不带 --quiet 的 config 输出。

刷新网页，应显示 v4 和 ZSwing-Plus Responses（未联网）。打开 AI 开关，确认发送范围，生成一次三种答法。只有真实返回完整答法才算实测通过，已配置不代表连通成功。问题和工作室资料会发送给第三方，store:false 是协议请求，不是第三方绝不保留数据的保证。

403 可能是权限或额度问题，请在平台核对。失败时不自动使用另一把密钥或另一家服务。不要把错误堆栈或密钥公开。

本机仅模拟验证请求和响应、错误处理及 UI，未持有用户密钥、未执行真实付费调用。服务器网络和真实接口兼容性仍需部署后验证。
