module.exports = {
    apps: [{
        name: 'radiochat-server',
        script: 'dist/server.js',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        restart_delay: 4000,
        max_restarts: 10,
        min_uptime: '10s',
        kill_timeout: 5000,
        env: {
            NODE_ENV: 'development',
            PORT: 8080
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 8080
        },
        error_file: '/opt/radiochat/logs/err.log',
        out_file: '/opt/radiochat/logs/out.log',
        log_file: '/opt/radiochat/logs/combined.log',
        time: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        cwd: '/opt/radiochat'
    }]
};
