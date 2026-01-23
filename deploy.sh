#!/bin/bash
# Deployment script for Eurus Server (Simplified)
set -e  # Exit on any error

echo "🚀 Starting Eurus Server deployment..."

# Navigate to project directory
cd /opt/eurus

# Stop the current server
echo "⏹️  Stopping current server..."
pm2 stop eurus-server || echo "Server was not running"

# Pull latest code from GitHub
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install

# Set up environment configuration
echo "🔧 Setting up environment configuration..."
if [ -f "/opt/eurus/config/.env.production" ]; then
    cp /opt/eurus/config/.env.production .env
    echo "✅ Environment file copied successfully"
else
    echo "⚠️  No production env file found, using defaults"
    cp .env.example .env
fi

# Copy ecosystem config if it exists
if [ -f "/opt/eurus/config/ecosystem.config.js" ]; then
    cp /opt/eurus/config/ecosystem.config.js ecosystem.config.js
    echo "✅ Ecosystem config copied"
fi

# Build the application
echo "🔨 Building application..."
npm run build

# Create logs directory
mkdir -p logs

# Start the server
echo "▶️  Starting server..."
if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js --env production
else
    pm2 start dist/server.js --name eurus-server
fi

# Save PM2 configuration
pm2 save

echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Server Status:"
pm2 status
echo ""
echo "📝 Recent logs:"
pm2 logs eurus-server --lines 10
