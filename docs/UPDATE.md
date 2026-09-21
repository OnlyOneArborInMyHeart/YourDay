# YourDay 版本更新手册

项目提供 Windows PowerShell 一键部署脚本：`scripts/deploy.ps1`。

## 自动执行的操作

1. 本机执行 `npm ci` 和前端生产构建。
2. 只打包前端构建产物和后端程序。
3. 通过 SSH 别名 `YourDay` 上传发布包。
4. 更新前用 SQLite 在线备份数据库。
5. 安装后端生产依赖，重启 systemd 服务并重载 Nginx。
6. 检查服务器本机和公网健康接口。
7. 清理本次的临时发布包。

## 日常发布

```powershell
cd E:\MyProject\YourDay
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\deploy.ps1
```

`Set-ExecutionPolicy` 只对当前 PowerShell 窗口生效，关闭窗口后失效。

## 参数

更换域名后：

```powershell
.\scripts\deploy.ps1 -PublicUrl "https://yourday.example.com"
```

如果 SSH 别名变了：

```powershell
.\scripts\deploy.ps1 -SshHost "new-server"
```

如果前端开发服务正在运行导致 `npm ci` 无法替换被占用的文件，且当前依赖已安装，可跳过重复安装：

```powershell
.\scripts\deploy.ps1 -SkipFrontendInstall
```

## 备份和排查

每次更新前的数据库备份位于：

```text
/opt/yourday/backend/backups/yourday-before-deploy-YYYYMMDD-HHMMSS.db.gz
```

查看日志和状态：

```bash
sudo journalctl -u yourday -n 100 --no-pager
systemctl status yourday --no-pager
curl http://127.0.0.1/api/health
```

## 安全边界

- 脚本不会上传或覆盖 `/opt/yourday/backend/.env`。
- 脚本不会上传或覆盖 `/opt/yourday/backend/data`。
- 发布前会先备份 SQLite 数据库。
- 如果本地构建失败，不会上传或重启服务器。
