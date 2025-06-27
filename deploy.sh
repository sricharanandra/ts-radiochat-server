#!/bin/bash
# Deployment script for RadioChat Server

set -e  # Exit on any error

echo "🚀 Starting RadioChat Server deployment..."

# Navigate to project directory
cd /opt/radiochat

# Stop the current server
echo "⏹️  Stopping current server..."
pm2 stop radiochat-server || echo "Server was not running"

# Pull latest code from GitHub
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install
echo "🔌 Testing database connection..."
if node -e "
const { PrismaClient } = require('@prisma/client');
(async () => {
    const prisma = new PrismaClient();
    try {
        await prisma.\$connect();
        console.log('Database connection successful');
        await prisma.\$disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Database connection failed:', error.message);
        process.exit(1);
    }
})();
"; then
    echo "✅ Database connection test passed"
else
    echo "❌ Database connection test failed"
    exit 1
fi

# Set up environment configuration
echo "🔧 Setting up environment configuration..."
if [ -f "/opt/radiochat/config/.env.production" ]; then
    cp /opt/radiochat/config/.env.production .env
    echo "✅ Environment file copied successfully"
else
    echo "❌ Error: /opt/radiochat/config/.env.production not found!"
    exit 1
fi

# Verify environment file
echo "🔍 Verifying environment configuration..."
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    # Check if DATABASE_URL is set (without showing the value)
    if grep -q "DATABASE_URL=" .env; then
        echo "✅ DATABASE_URL is configured"
    else
        echo "❌ DATABASE_URL not found in .env file"
        exit 1
    fi
else
    echo "❌ .env file not found"
    exit 1
fi

# Copy ecosystem config if it exists
if [ -f "/opt/radiochat/config/ecosystem.config.js" ]; then
    cp /opt/radiochat/config/ecosystem.config.js ecosystem.config.js
    echo "✅ Ecosystem config copied"
fi

# Generate Prisma client
echo "🗄️  Generating Prisma client..."
npx prisma generate

# Database setup - check if this is first deployment
echo "🔄 Setting up database..."
if npx prisma migrate status | grep -q "No migration found"; then
    echo "📋 No existing migrations found. Pushing schema to database..."
    npx prisma db push
else
    echo "📋 Running database migrations..."
    npx prisma migrate deploy
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
    pm2 start dist/server.js --name radiochat-server
fi

# Save PM2 configuration
pm2 save

echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Server Status:"
pm2 status

echo ""
echo "📝 Recent logs:"
pm2 logs radiochat-server --lines 10
