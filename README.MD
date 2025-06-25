# RadioChat Server

A real-time WebSocket chat server built with TypeScript, PostgreSQL, and Prisma ORM. Supports multiple chat rooms with persistent message storage.

> this is only the server code along with a sample .env and other config files. Actual sensitive data is hidden and running on my server, making this a fully-fledged working backend for the ts-radiochat-client.

## 🚀 Features

- **Real-time messaging** via WebSockets
- **Persistent storage** with PostgreSQL and Prisma
- **Room-based chat** organization
- **Type-safe** development with TypeScript
- **Scalable architecture** ready for production
- **Cross-platform client** support

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **WebSockets**: ws library
- **Process Management**: PM2

## 📋 Prerequisites

- Node.js 18 or higher
- PostgreSQL 12 or higher
- npm or yarn package manager

## 🔧 Installation

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/ts-radiochat-server.git
cd ts-radiochat-server
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your actual configuration
```

### 4. Set up PostgreSQL database
```bash
# Create database and user (Linux/macOS)
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE radiochat;
CREATE USER rc-user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE radiochat TO rc_user;
\c radiochat
GRANT ALL ON SCHEMA public TO rc_user;
\q
```

### 5. Initialize database schema
```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Or push schema directly
npx prisma db push
```

### 6. Build and start the server
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## 📡 WebSocket API

### Connection
Connect to: `ws://localhost:8080` on ts-radiochat-client (different repo) if testing in local (or your deployed URL)

### Events

#### Client → Server
- `create-room`: Create a new chat room
- `join-room`: Join an existing room
- `leave-room`: Leave current room
- `send-message`: Send message to current room
- `delete-room`: Delete room (creator only)

#### Server → Client
- `room-created`: Room creation confirmation
- `room-joined`: Room join confirmation
- `message`: New message received
- `room-deleted`: Room deletion notification
- `error`: Error messages

## 🗄️ Database Schema

The application uses PostgreSQL with the following main entities:

- **Rooms**: Chat room information and metadata
- **Messages**: Individual chat messages with timestamps
- **Users**: User accounts and authentication (planned)

See `prisma/schema.prisma` for the complete schema definition.

## 🔧 Development

### Available Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:studio` - Open Prisma Studio

## 🌐 Related Projects

- [RadioChat Client](https://github.com/sricharanandra/ts-radiochat) - TypeScript CLI client

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

