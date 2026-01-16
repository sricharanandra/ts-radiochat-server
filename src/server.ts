import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from './database';
import { verifyToken } from './auth';
import api from './api';
import {
  ConnectedUser,
  ActiveRoom,
  ClientMessage,
  ServerMessage,
  JoinRoomPayload,
  SendMessagePayload,
  CreateRoomPayload,
  LeaveRoomPayload,
  ListRoomsPayload,
  BaseMessage,
} from './types';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '8080');
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Startup logging
console.log(`[STARTUP] RadioChat Server v1.0.0`);
console.log(`[STARTUP] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[STARTUP] Host: ${HOST}:${PORT}`);
console.log(`[STARTUP] Authentication: ${isProduction ? 'SSH Keys Required' : 'Development Mode (simpleLogin enabled)'}`);
console.log(`[STARTUP] Database: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}`);

// ============================================================================
// SERVER STATE
// ============================================================================

const connectedUsers = new Map<WebSocket, ConnectedUser>();
const activeRooms = new Map<string, ActiveRoom>();

// ============================================================================
// HTTP + WEBSOCKET SERVER
// ============================================================================

// Create HTTP server for both API and WebSocket
const httpServer = createServer(api);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server: httpServer,
  path: '/ws',
});

console.log("=====================================================");
console.log("🚀 RadioChat Server Starting...");
console.log("=====================================================");

// ============================================================================
// WEBSOCKET CONNECTION HANDLER
// ============================================================================

wss.on("connection", async (ws: WebSocket, request) => {
  console.log(`[WS] New client connected from ${request.socket.remoteAddress}`);

  // Parse token from query string
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const token = url.searchParams.get('token');

  let user: ConnectedUser | null = null;

  // If token provided, verify it
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      user = {
        userId: payload.userId,
        username: payload.username,
        ws,
        currentRoomId: null,
        isAuthenticated: true,
      };
      console.log(`[AUTH] User authenticated: ${user.username} (${user.userId})`);
    } else {
      console.log('[AUTH] Invalid token provided');
    }
  }

  // If no valid authentication, create guest user in database
  if (!user) {
    const guestUsername = `Guest_${Math.random().toString(36).substring(7)}`;
    
    // Create guest user in database
    const dbUser = await prisma.user.create({
      data: {
        username: guestUsername,
      },
    });
    
    user = {
      userId: dbUser.id,
      username: dbUser.username,
      ws,
      currentRoomId: null,
      isAuthenticated: false,
    };
    console.log(`[AUTH] Guest user created: ${guestUsername} (${dbUser.id})`);
  }

  connectedUsers.set(ws, user);

  // Send welcome message
  sendMessage(ws, {
    type: "info",
    payload: {
      message: `Welcome ${user.username}! You are ${user.isAuthenticated ? 'authenticated' : 'connected as guest'}.`,
    },
  });

  // ============================================================================
  // MESSAGE HANDLER
  // ============================================================================

  ws.on("message", async (data: Buffer) => {
    try {
      const messageText = data.toString();
      console.log(`[WS] ← Received from ${user?.username}:`, messageText);

      const message: ClientMessage = JSON.parse(messageText);

      if (!message.type) {
        return sendError(ws, "Message missing 'type' field");
      }

      const currentUser = connectedUsers.get(ws);
      if (!currentUser) {
        return sendError(ws, "User not found");
      }

      // Handle different message types
      switch (message.type) {
        case "joinRoom":
          await handleJoinRoom(currentUser, message.payload);
          break;

        case "sendMessage":
          await handleSendMessage(currentUser, message.payload);
          break;

        case "createRoom":
          await handleCreateRoom(currentUser, message.payload);
          break;

        case "leaveRoom":
          await handleLeaveRoom(currentUser, message.payload);
          break;

        case "listRooms":
          await handleListRooms(currentUser, message.payload);
          break;

        default:
          console.error(`[WS] Unknown message type: ${(message as any).type}`);
          sendError(ws, `Unknown message type: ${(message as any).type}`);
      }
    } catch (error: any) {
      console.error("[WS] Error parsing message:", error);
      sendError(ws, "Invalid message format");
    }
  });

  // ============================================================================
  // DISCONNECT HANDLER
  // ============================================================================

  ws.on("close", () => {
    const user = connectedUsers.get(ws);
    if (user) {
      console.log(`[WS] User disconnected: ${user.username}`);
      handleDisconnect(user);
      connectedUsers.delete(ws);
    }
  });

  ws.on("error", (error) => {
    console.error("[WS] WebSocket error:", error);
  });
});

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

async function handleJoinRoom(user: ConnectedUser, payload: JoinRoomPayload) {
  const { roomId, roomName } = payload;

  if (!roomId && !roomName) {
    return sendError(user.ws, "Room ID or room name is required");
  }

  console.log(`[ROOM] ${user.username} attempting to join room: ${roomId || roomName}`);

  // Check if room exists in database (by ID or name)
  const room = await prisma.room.findFirst({
    where: {
      OR: [
        roomId ? { id: roomId } : {},
        roomName ? { name: roomName } : {},
      ],
      deletedAt: null,
    },
    include: {
      messages: {
        include: {
          sender: {
            select: { username: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
      members: {
        where: { userId: user.userId },
      },
    },
  });

  if (!room) {
    return sendError(user.ws, "Room not found");
  }

  // Check if room is private and user is not a member
  if (room.roomType === 'private' && room.members.length === 0) {
    return sendError(user.ws, "You don't have access to this private room");
  }

  // Leave current room if in one
  if (user.currentRoomId) {
    await handleLeaveRoom(user, { roomId: user.currentRoomId });
  }

  // Add user to room membership in database
  await prisma.roomMember.upsert({
    where: {
      roomId_userId: {
        roomId: room.id,
        userId: user.userId,
      },
    },
    create: {
      roomId: room.id,
      userId: user.userId,
    },
    update: {},
  });

  // Create or get active room
  let activeRoom = activeRooms.get(room.id);
  if (!activeRoom) {
    activeRoom = {
      id: room.id,
      name: room.name,
      displayName: room.displayName,
      roomType: room.roomType,
      encryptedKey: room.encryptedKey || '',
      users: [],
    };
    activeRooms.set(room.id, activeRoom);
  }

  // Add user to active room
  if (!activeRoom.users.find(u => u.userId === user.userId)) {
    activeRoom.users.push(user);
  }
  user.currentRoomId = room.id;

  // Send room joined confirmation with message history and encryption key
  const messages = room.messages.map(m => ({
    id: m.id,
    username: m.sender.username,
    ciphertext: m.ciphertext,
    timestamp: m.createdAt.toISOString(),
  }));

  sendMessage(user.ws, {
    type: "roomJoined",
    payload: {
      roomId: room.id,
      roomName: room.name,
      displayName: room.displayName,
      roomType: room.roomType,
      encryptedKey: room.encryptedKey || '',
      messages,
    },
  });

  // Broadcast to others in room
  broadcastToRoom(room.id, {
    type: "userJoined",
    payload: {
      username: user.username,
      userId: user.userId,
    },
  }, user.ws);

  console.log(`[ROOM] ${user.username} joined room: ${room.displayName} (${room.id})`);
}

async function handleSendMessage(user: ConnectedUser, payload: SendMessagePayload) {
  const { roomId, ciphertext } = payload;

  if (!user.currentRoomId || user.currentRoomId !== roomId) {
    return sendError(user.ws, "You must be in the room to send messages");
  }

  if (!ciphertext) {
    return sendError(user.ws, "Message content is required");
  }

  console.log(`[MSG] ${user.username} sending message to room ${roomId}`);

  // Save message to database
  const message = await prisma.message.create({
    data: {
      roomId,
      senderId: user.userId,
      ciphertext,
    },
  });

  // Broadcast to all users in room
  const messagePayload = {
    id: message.id,
    username: user.username,
    ciphertext: message.ciphertext,
    timestamp: message.createdAt.toISOString(),
  };

  broadcastToRoom(roomId, {
    type: "message",
    payload: messagePayload,
  });

  console.log(`[MSG] Message ${message.id} broadcast to room ${roomId}`);
}

async function handleCreateRoom(user: ConnectedUser, payload: CreateRoomPayload) {
  const { name, displayName, roomType } = payload;

  if (!name) {
    return sendError(user.ws, "Room name is required");
  }

  if (!roomType || (roomType !== 'public' && roomType !== 'private')) {
    return sendError(user.ws, "Room type must be 'public' or 'private'");
  }

  console.log(`[ROOM] ${user.username} creating ${roomType} room: ${name}`);

  // Check if room name already exists
  const existingRoom = await prisma.room.findUnique({
    where: { name },
  });

  if (existingRoom) {
    return sendError(user.ws, `Room name '${name}' already exists`);
  }

  // Generate encryption key for the room
  const encryptedKey = crypto.randomBytes(32).toString('hex');

  // Auto-generate display name if not provided
  const finalDisplayName = displayName || `#${name}`;

  // Create room in database
  const room = await prisma.room.create({
    data: {
      name,
      displayName: finalDisplayName,
      roomType,
      encryptedKey,
      creatorId: user.userId,
    },
  });

  // Add creator as member
  await prisma.roomMember.create({
    data: {
      roomId: room.id,
      userId: user.userId,
    },
  });

  // Send confirmation
  sendMessage(user.ws, {
    type: "roomCreated",
    payload: {
      roomId: room.id,
      roomName: room.name,
      displayName: room.displayName,
      roomType: room.roomType,
      encryptedKey: room.encryptedKey || '',
    },
  });

  console.log(`[ROOM] ${roomType} room created: ${room.displayName} (${room.id}) by ${user.username}`);
}

async function handleListRooms(user: ConnectedUser, payload: ListRoomsPayload) {
  console.log(`[ROOM] ${user.username} requesting room list`);

  // Get all public rooms
  const publicRooms = await prisma.room.findMany({
    where: {
      roomType: 'public',
      deletedAt: null,
    },
    include: {
      _count: {
        select: { members: true },
      },
      members: {
        where: { userId: user.userId },
      },
    },
  });

  // Get user's private rooms (only ones they're a member of)
  const privateRooms = await prisma.room.findMany({
    where: {
      roomType: 'private',
      deletedAt: null,
      members: {
        some: { userId: user.userId },
      },
    },
    include: {
      _count: {
        select: { members: true },
      },
      members: {
        where: { userId: user.userId },
      },
    },
  });

  // Format room info
  const formatRoom = (room: any) => ({
    roomId: room.id,
    name: room.name,
    displayName: room.displayName,
    roomType: room.roomType,
    memberCount: room._count.members,
    isJoined: room.members.length > 0,
  });

  sendMessage(user.ws, {
    type: "roomsList",
    payload: {
      publicRooms: publicRooms.map(formatRoom),
      privateRooms: privateRooms.map(formatRoom),
    },
  });

  console.log(`[ROOM] Sent room list to ${user.username}: ${publicRooms.length} public, ${privateRooms.length} private`);
}

async function handleLeaveRoom(user: ConnectedUser, payload: LeaveRoomPayload) {
  const { roomId } = payload;

  if (!roomId) {
    return;
  }

  console.log(`[ROOM] ${user.username} leaving room ${roomId}`);

  // Remove from active room
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom) {
    activeRoom.users = activeRoom.users.filter(u => u.userId !== user.userId);

    // Broadcast user left
    broadcastToRoom(roomId, {
      type: "userLeft",
      payload: {
        username: user.username,
        userId: user.userId,
      },
    });

    // Remove active room if empty
    if (activeRoom.users.length === 0) {
      activeRooms.delete(roomId);
      console.log(`[ROOM] Active room ${roomId} removed (no users)`);
    }
  }

  user.currentRoomId = null;
}

function handleDisconnect(user: ConnectedUser) {
  if (user.currentRoomId) {
    handleLeaveRoom(user, { roomId: user.currentRoomId });
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function sendMessage(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    const json = JSON.stringify(message);
    console.log(`[WS] → Sending:`, json);
    ws.send(json);
  }
}

function sendError(ws: WebSocket, message: string) {
  sendMessage(ws, {
    type: "error",
    payload: { message },
  });
}

function broadcastToRoom(roomId: string, message: ServerMessage, excludeWs?: WebSocket) {
  const room = activeRooms.get(roomId);
  if (!room) return;

  const json = JSON.stringify(message);
  console.log(`[BROADCAST] To room ${roomId}:`, json);

  room.users.forEach(user => {
    if (user.ws !== excludeWs && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(json);
    }
  });
}

// ============================================================================
// START SERVER
// ============================================================================

httpServer.listen(PORT, HOST, () => {
  console.log(`✅ HTTP API listening on http://${HOST}:${PORT}`);
  console.log(`✅ WebSocket server listening on ws://${HOST}:${PORT}/ws`);
  console.log(`📊 Health check available at http://${HOST}:${PORT}/health`);
  console.log("=====================================================");
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

async function shutdown() {
  console.log('\n🛑 Shutting down server...');
  
  // Close all WebSocket connections gracefully
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, 'Server shutting down');
    }
  });

  wss.close(() => {
    console.log('✅ WebSocket server closed');
  });

  httpServer.close(() => {
    console.log('✅ HTTP server closed');
  });

  await prisma.$disconnect();
  console.log('✅ Database disconnected');
  
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
