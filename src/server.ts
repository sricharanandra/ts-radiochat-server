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

    // Auto-assign a random username to new connections
    const randomUsername = `User_${crypto.randomBytes(4).toString('hex')}`;
    const user: ConnectedUser = {
        username: randomUsername,
        ws,
        currentRoom: null
    };
    connectedUsers.set(ws, user);
    console.log(`👤 Auto-assigned username: ${randomUsername}`);

    ws.on("message", async (data: string) => {
        try {
            console.log("📥 Received raw message:", data);
            const message = JSON.parse(data);
            console.log("📋 Parsed message:", message);

            const { typ, payload } = message;

            switch (typ) {
                case "joinRoom":
                    handleJoinRoom(payload, ws);
                    break;
                case "message":
                    handleSendMessage(payload, ws);
                    break;
                default:
                    console.error(`❌ Unknown message type: ${typ}`);
                    sendError(ws, `Unknown message type: ${typ}`);
            }
        } catch (error) {
            console.error("❌ Error parsing message:", error);
            console.error("❌ Raw data was:", data);
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

function handleJoinRoom(payload: any, ws: WebSocket) {
    const user = connectedUsers.get(ws);
    if (!user) {
        return sendError(ws, "User not found");
    }

    console.log("🚪 Join room payload:", payload);
    const { room_id } = payload;

    if (!room_id) {
        return sendError(ws, "Room ID is required");
    }

    // If room doesn't exist, create it
    if (!chatRooms[room_id]) {
        const room: ChatRoom = {
            id: room_id,
            name: `Room ${room_id}`,
            creator: user.username,
            users: [],
            messages: []
        };
        chatRooms[room_id] = room;
        console.log(`🏠 Room created: ${room.name} (${room_id})`);
    }

    const room = chatRooms[room_id];

    // Check if user is already in the room
    const isAlreadyInRoom = room.users.some(u => u.username === user.username);
    if (isAlreadyInRoom) {
        console.log(`👤 ${user.username} already in room ${room_id}`);
        // Still send the confirmation
    } else {
        // Leave current room if in one
        if (user.currentRoom) {
            leaveCurrentRoom(user);
        }

        // Join new room
        room.users.push(user);
        user.currentRoom = room_id;

        // Notify other users
        broadcast(room_id, {
            typ: "userJoined",
            payload: { username: user.username }
        }, ws);
    }

    // Send join confirmation (client expects this format)
    const joinResponse = {
        typ: "roomJoined",
        payload: {
            room_id,
            messages: room.messages.slice(-50) // Last 50 messages
        }
    };
    console.log("📤 Sending join response:", joinResponse);
    ws.send(JSON.stringify(joinResponse));

    console.log(`👤 ${user.username} joined room ${room.name} (${room_id})`);
}

function handleSendMessage(payload: any, ws: WebSocket) {
    const user = connectedUsers.get(ws);
    if (!user) {
        return sendError(ws, "User not found");
    }

    if (!user.currentRoom) {
        return sendError(ws, "You must be in a room to send messages");
    }

    console.log("💬 Send message payload:", payload);
    const { room_id, ciphertext } = payload;

    // Verify the room_id matches current room
    if (room_id !== user.currentRoom) {
        return sendError(ws, "Room mismatch");
    }

    const room = chatRooms[user.currentRoom];
    if (!room) {
        return sendError(ws, "Room not found");
    }

    const messageObj = {
        id: crypto.randomUUID(),
        username: user.username,
        ciphertext: ciphertext, // Use 'ciphertext' field to match client expectations
        timestamp: new Date().toISOString()
    };

    room.messages.push(messageObj);

    // Broadcast message to all users in the room
    const messageResponse = {
        typ: "message",
        payload: messageObj
    };
    console.log("📤 Broadcasting message:", messageResponse);
    broadcast(user.currentRoom, messageResponse);

    console.log(`💬 [${room.name}] ${user.username}: [encrypted message]`);
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
            typ: "userLeft",
            payload: { username: user.username }
        }, user.ws);

        // If room is empty, clean it up
        if (room.users.length === 0) {
            delete chatRooms[user.currentRoom];
            console.log(`🗑️ Room ${room.name} (${user.currentRoom}) deleted - no users remaining`);
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
    const errorResponse = {
        typ: "error",
        payload: { message }
    };
    console.log("❌ Sending error:", errorResponse);
    ws.send(JSON.stringify(errorResponse));
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
