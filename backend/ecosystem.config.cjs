module.exports = {
  apps: [
    {
      name: 'gestion-materiales-backend',
      cwd: __dirname,
      script: './dist/server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      merge_logs: true,
      time: true,
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4009,
      },
    },
  ],
};