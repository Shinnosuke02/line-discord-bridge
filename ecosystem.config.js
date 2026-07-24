module.exports = {
  apps: [
    {
      name: 'line-discord-bridge',
      script: 'src/app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      // Keep enough headroom for nginx, Oracle Cloud Agent and the OS on the
      // current 1 GB VM. systemd provides a second, higher hard limit.
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 15000,
      wait_ready: true,
      listen_timeout: 8000
    }
  ]
};
