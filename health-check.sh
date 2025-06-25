#!/bin/bash
# filepath: /opt/radiochat/health-check.sh

# Check if PM2 process is running
if ! pm2 show radiochat-server > /dev/null 2>&1; then
    echo "$(date): radiochat-server is not running, starting..." >> /opt/radiochat/logs/health-check.log
    cd /opt/radiochat && pm2 start ecosystem.config.js --env production
fi

# Check if port 8080 is responding
if ! nc -z localhost 8080; then
    echo "$(date): Port 8080 not responding, restarting service..." >> /opt/radiochat/logs/health-check.log
    pm2 restart radiochat-server
fi
