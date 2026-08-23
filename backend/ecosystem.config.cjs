// PM2 配置 — 部署时执行：
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'yourday-api',
      script: 'src/server.js',
      cwd: '/opt/yourday/backend',
      instances: 1, // 单实例即可；SQLite 写并发不适合多 worker
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_DIR: '/opt/yourday/backend/logs',
      },
      out_file: '/var/log/pm2/yourday-api.out.log',
      error_file: '/var/log/pm2/yourday-api.err.log',
      time: true,
      // 监听文件变更重启（生产可关闭）
      watch: false,
    },
  ],
};