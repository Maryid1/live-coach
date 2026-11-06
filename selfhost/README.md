# 在场自部署测试包

> v2 更新说明：本文件下方为旧版首次安装流程。现有公网实例请使用同目录 `UPDATE-v2.md`，保留原密码及公网端口，不要重新执行首次安装。v2 已实现百炼服务端适配器，需要配置后才能使用真实 AI；旧文中的“AI 未接入”不再表示没有接口代码。

## 范围和验证边界

网页在开发电脑编译，服务器只复制文件运行，无需 npm install 或编译 React。Node 服务无第三方运行依赖。账号密码独立于 ChatGPT。本包提供内置话术、暖场、提词、提醒；AI 联网未接入，浏览器语音识别仍受浏览器和网络条件限制。不要向设置页填入密钥。

本机没有运行中的 Docker Linux 引擎，因此容器实机启动需在服务器验证，不保证镜像下载在当前网络成功。当前默认不对公网开放。

## 上传和启动

通过 Workbench 文件上传，把 live-coach-selfhost.tar.gz 放到用户主目录，然后执行：

```sh
mkdir -p ~/live-coach-test
tar -xzf ~/live-coach-selfhost.tar.gz -C ~/live-coach-test
cd ~/live-coach-test
umask 077
cp -n .env.example .env
```

用 Workbench 文件编辑器打开 `~/live-coach-test/.env`，设置用户名和至少16位随机字母数字密码，勿使用已有云账号密码。密码不要截图或发送。随后：

```sh
sudo docker compose config --quiet
sudo docker compose up -d --build
sudo docker compose ps
curl -I http://127.0.0.1:3000/
```

最后返回 401 Unauthorized 是预期：服务正常且要求认证。第一次启动需从 Docker 仓库下载基础镜像；失败时提供错误，不使用不可信镜像源。

## 安全访问

默认只监听服务器本机127.0.0.1，公网IP:3000无法打开不是故障。不要将 HTTP 密码认证暴露到公网，也不要开放 Docker 管理端口。

电脑可通过 SSH 隧道验证，需要确认 SSH 认证可用和主机指纹：

```sh
ssh -N -L 5174:127.0.0.1:3000 admin@你的服务器公网IP
```

在该电脑打开 http://127.0.0.1:5174，使用.env的独立用户名密码。隧道关闭后地址失效。不要关闭SSH主机校验。

手机外网访问仍需域名、HTTPS、登录失败限流与实际网络测试。上海实例还需核对备案资格；一个月试用不等于具备备案资格。本包不是已完成的手机公网访问方案。

## 运维

```sh
sudo docker compose logs --tail=80
sudo docker compose stop
sudo docker compose start
```

资料仍保存在访问者浏览器，换网址不会自动迁移。更新前保留旧部署目录、镜像和.env，新版本在独立目录验证再切换。不要运行 docker system prune -a 删除回滚镜像。试用到期前备份，不需现在购买其他产品。
