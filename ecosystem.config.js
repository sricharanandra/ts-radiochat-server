module.exports = {
    apps: [{
        name: 'ts-radiochat-server',
        script: 'dist/server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        restart_delay: 4000,
        max_restarts: 10,
        min_uptime: '10s',
        env: {
            NODE_ENV: 'development',
            PORT: 8080
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 8080
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        kill_timeout: 1600,
        // Working directory - ensures db.json is created in the right location
        cwd: '/home/sreus/lab/projects/ts-radiochat-server'
    }]
};
