import { WebSocketServer, WebSocket } from "ws";
import dotenv from 'dotenv';
dotenv.config();
import crypto from "crypto";
import { ChatRoom, ConnectedUser } from "./types";

const chatRooms: Record<string, ChatRoom> = {};
const wss = new WebSocketServer({ port: 8080, host: '0.0.0.0' });

// Map to track which user is associated with which WebSocket connection
const connectedUsers = new Map<WebSocket, ConnectedUser>();

console.log("🚀 RadioChat Server starting...");
console.log("📡 WebSocket server listening on port 8080");

wss.on("connection", (ws: WebSocket) => {
    console.log("👤 New client connected");
    
    ws.on("message", async (data: string) => {
        try {
            const message = JSON.parse(data);
            const { type, payload } = message;
            
            switch (type) {
                case "setUsername":
                    handleSetUsername(payload, ws);
                    break;
                case "createRoom":
                    handleCreateRoom(payload, ws);
                    break;
                case "joinRoom":
                    handleJoinRoom(payload, ws);
                    break;
                case "sendMessage":
                    handleSendMessage(payload, ws);
                    break;
                case "leaveRoom":
                    handleLeaveRoom(ws);
                    break;
                default:
                    sendError(ws, `Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error("Error parsing message:", error);
            sendError(ws, "Invalid message format");
        }
    });

    ws.on("close", () => {
        handleDisconnect(ws);
        console.log("👤 Client disconnected");
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });
});

function handleSetUsername(payload: any, ws: WebSocket) {
    const { username } = payload;
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return sendError(ws, "Valid username is required");
    }
    
    const user: ConnectedUser = {
        username: username.trim(),
        ws,
        currentRoom: null
    };
    
    connectedUsers.set(ws, user);
    ws.send(JSON.stringify({ 
        type: "usernameSet", 
        payload: { username: user.username } 
    }));
    console.log(`👤 User set username: ${user.username}`);
}

function handleCreateRoom(payload: any, ws: WebSocket) {
    const user = connectedUsers.get(ws);
    if (!user) {
        return sendError(ws, "Please set username first");
    }
    
    const { roomName } = payload;
    if (!roomName || typeof roomName !== 'string' || roomName.trim().length === 0) {
        return sendError(ws, "Valid room name is required");
    }
    
    const roomId = generateRoomId();
    const room: ChatRoom = {
        id: roomId,
        name: roomName.trim(),
        creator: user.username,
        users: [user],
        messages: []
    };
    
    chatRooms[roomId] = room;
    user.currentRoom = roomId;
    
    ws.send(JSON.stringify({
        type: "roomCreated",
        payload: { roomId, roomName: room.name }
    }));
    
    console.log(`🏠 Room created: ${room.name} (${roomId}) by ${user.username}`);
}

function handleJoinRoom(payload: any, ws: WebSocket) {
    const user = connectedUsers.get(ws);
    if (!user) {
        return sendError(ws, "Please set username first");
    }
    
    const { roomId } = payload;
    const room = chatRooms[roomId];
    
    if (!room) {
        return sendError(ws, "Room not found");
    }
    
    // Check if user is already in the room
    const isAlreadyInRoom = room.users.some(u => u.username === user.username);
    if (isAlreadyInRoom) {
        return sendError(ws, "You are already in this room");
    }
    
    // Leave current room if in one
    if (user.currentRoom) {
        leaveCurrentRoom(user);
    }
    
    // Join new room
    room.users.push(user);
    user.currentRoom = roomId;
    
    // Send room history to new user
    ws.send(JSON.stringify({
        type: "roomJoined",
        payload: { 
            roomId, 
            roomName: room.name,
            messages: room.messages.slice(-50) // Last 50 messages
        }
    }));
    
    // Notify other users
    broadcast(roomId, {
        type: "userJoined",
        payload: { username: user.username }
    }, ws);
    
    console.log(`👤 ${user.username} joined room ${room.name} (${roomId})`);
}

function handleSendMessage(payload: any, ws: WebSocket) {
    const user = connectedUsers.get(ws);
    if (!user) {
        return sendError(ws, "Please set username first");
    }
    
    if (!user.currentRoom) {
        return sendError(ws, "You must be in a room to send messages");
    }
    
    const { message } = payload;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return sendError(ws, "Message cannot be empty");
    }
    
    const room = chatRooms[user.currentRoom];
    if (!room) {
        return sendError(ws, "Room not found");
    }
    
    const messageObj = {
        id: crypto.randomUUID(),
        username: user.username,
        content: message.trim(),
        timestamp: new Date().toISOString()
    };
    
    room.messages.push(messageObj);
    
    // Broadcast message to all users in the room
    broadcast(user.currentRoom, {
        type: "message",
        payload: messageObj
    });
    
    console.log(`💬 [${room.name}] ${user.username}: ${message.trim()}`);
}

function handleLeaveRoom(ws: WebSocket) {
    const user = connectedUsers.get(ws);
    if (!user || !user.currentRoom) {
        return sendError(ws, "You are not in a room");
    }
    
    leaveCurrentRoom(user);
    ws.send(JSON.stringify({ type: "leftRoom", payload: {} }));
}

function handleDisconnect(ws: WebSocket) {
    const user = connectedUsers.get(ws);
    if (user) {
        if (user.currentRoom) {
            leaveCurrentRoom(user);
        }
        connectedUsers.delete(ws);
    }
}

function leaveCurrentRoom(user: ConnectedUser) {
    if (!user.currentRoom) return;
    
    const room = chatRooms[user.currentRoom];
    if (room) {
        // Remove user from room
        room.users = room.users.filter(u => u.username !== user.username);
        
        // Notify other users
        broadcast(user.currentRoom, {
            type: "userLeft",
            payload: { username: user.username }
        }, user.ws);
        
        // If room is empty, clean it up
        if (room.users.length === 0) {
            delete chatRooms[user.currentRoom];
            console.log(`🗑️  Room ${room.name} (${user.currentRoom}) deleted - no users remaining`);
        }
    }
    
    user.currentRoom = null;
}

function broadcast(roomId: string, message: any, excludeWs?: WebSocket) {
    const room = chatRooms[roomId];
    if (!room) return;
    
    const messageStr = JSON.stringify(message);
    room.users.forEach(user => {
        if (user.ws !== excludeWs && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(messageStr);
        }
    });
}

function sendError(ws: WebSocket, message: string) {
    ws.send(JSON.stringify({
        type: "error",
        payload: { message }
    }));
}

function generateRoomId(): string {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    wss.close(() => {
        console.log('✅ Server shutdown complete');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server...');
    wss.close(() => {
        console.log('✅ Server shutdown complete');
        process.exit(0);
    });
});