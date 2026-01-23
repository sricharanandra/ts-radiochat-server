# Eurus Server

WebSocket-based chat server with end-to-end encryption, SSH key authentication, and PostgreSQL storage.

## Requirements

- Node.js 20+
- PostgreSQL 15+
- npm

## Installation

```bash
npm install
cp .env.example .env
# Edit .env with your configuration
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

## Environment Variables

```env
NODE_ENV=production
PORT=8081
HOST=127.0.0.1
JWT_SECRET=your-secret-here
DATABASE_URL=postgresql://user:pass@localhost:5432/eurus
```

## User Registration

Register user with SSH public key:

```bash
# Using the CLI directly
node dist/cli/register.js --username alice --key-file ~/.ssh/id_ed25519.pub --server https://eurus.sreus.tech
```

## API Endpoints

- GET /health - Health check
- POST /api/auth/register - Register user with SSH key
- POST /api/auth/challenge - Get authentication challenge
- POST /api/auth/verify - Verify SSH signature
- WS /ws - WebSocket connection (token in query param)

## WebSocket Protocol

Client to Server messages: createRoom, joinRoom, sendMessage, listRooms, leaveRoom

Server to Client messages: roomCreated, roomJoined, message, roomsList, error, info

## Deployment

See deployment/ directory for nginx, systemd, and logrotate configurations.

## License

MIT
