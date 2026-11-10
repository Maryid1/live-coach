# v5：口播稿库（先本地验收，再更新服务器）

左侧口播稿库分为我的口播稿、暖场话术、收藏片段。原暖场卡片直达暖场页。我的稿件支持 TXT/Markdown/Word .docx 提取纯文字、粘贴、编辑、删除、TXT 导出和提词，最大 2 MB 文件/50000 字正文/100 份。旧 .doc 不支持。导入先预览再保存，不执行文档内指令、不调用 AI。

服务器稿件在同一登录账号的设备间共享；列表用刷新按钮更新，编辑冲突会提示而不是静默覆盖。收藏片段仍为原浏览器本地数据。照稿直播与临场问答可切换，当前页面中保留稿件阅读位置；不保证刷新或换设备后仍在同一位置。

## 重要：此次必须增加持久化挂载，但不用改密钥

照 UPDATE-v2.md 先备份并解压新版，仍排除 `.env` 和 `compose.yaml`。在原 compose.yaml 的 environment 下增加，与 APP_USER 同级：

```yaml
      DATA_DIR: /app/data
```

在 web 服务内增加，与 environment、ports 同级：

```yaml
    volumes:
      - script-data:/app/data
```

文件最末尾新增顶层定义，`volumes:` 与最上面的 `services:` 对齐：

```yaml
volumes:
  script-data:
```

不要改原端口、密码、模型密钥。新 Dockerfile 会为 node 用户准备可写的数据目录。Docker 命名卷让稿件在容器重建后保留；不是放在镜像或公开源码里。不配置 DATA_DIR 会明确提示不可用，不假装保存成功。

在阿里云终端运行：

```sh
cd /home/admin/live-coach-test
sudo docker compose config --quiet && sudo docker compose up -d --build
sudo docker compose ps
```

依次进入目录、检查配置后构建重启、查看运行状态。预计短暂中断，启动后应看到 v5。不要运行 `docker compose down -v` 或删除 script-data 卷，否则会删除服务器稿件。

## 稿件备份

原来的 cp 备份部署目录不包含 Docker 命名卷。请另行备份稿件：

```sh
cd /home/admin/live-coach-test
umask 077
sudo docker compose exec -T web node -e "process.stdout.write(require('fs').readFileSync('/app/data/scripts.json'))" > "$HOME/live-coach-scripts-$(date +%Y%m%d-%H%M%S).json"
```

将服务器稿件导出为当前用户目录下带时间的私有备份文件；首次保存稿件前文件可能不存在，此时无需备份。检查命令成功且备份非空后再进行维护。不要将这些含私人口播稿的备份上传 GitHub。页面也可逐份导出 TXT。恢复前先备份现状，由维护者将有效备份恢复到卷里的 scripts.json，并确认 node 用户读写权限。

## 验收

电脑上传一份 .docx，检查文字后保存；手机用同一账号打开口播稿库并刷新，选择开始提词；切到临场问答再返回照稿直播；确认稿件和位置保留。暖场页仍可生成模板，并可另存为我的口播稿。收藏片段不应丢失。

本地验证不能替代阿里云 Docker 命名卷和安卓实测；发布时务必检查挂载及写入权限。
