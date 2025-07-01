import { WebSocketServer, WebSocket } from "ws";
import dotenv from 'dotenv';
dotenv.config();

import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import * as db from "./db";
import { AuthenticatedUser, ChatRoom, MessageWithAuthor } from "./types";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("FATAL: JWT_SECRET is not defined in the environment variables.");
    process.exit(1);
}

const chatRooms: Record<string, ChatRoom> = {};
const wss = new WebSocketServer({ port: 8080, host: '0.0.0.0' });

// Map to track which user is associated with which WebSocket connection
const connectedUsers = new Map<WebSocket, AuthenticatedUser>();

async function initialize() {
    try {
        console.log("Initializing server...");
        db.initDB();
        console.log("Server started successfully on port 8080.");
    } catch (error) {
        console.error("Failed to initialize server:", error);
        process.exit(1);
    }
}

initialize();

wss.on("connection", (ws: WebSocket) => {
    ws.on("message", async (data: string) => {
        try {
            const message = JSON.parse(data);
            const { type, payload } = message;

            // Non-authenticated routes
            if (type === "register") {
                await handleRegister(payload, ws);
                return;
            }
            if (type === "login") {
                await handleLogin(payload, ws);
                return;
            }

            // All routes below require authentication
            const user = await verifyToken(payload.token, ws);
            if (!user) return; // verifyToken sends error response

            // Associate ws with authenticated user for this session
            if (!connectedUsers.has(ws)) {
                connectedUsers.set(ws, { ...user, ws });
            }

            switch (type) {
                case "createRoom":
                    await handleCreateRoom(user, payload, ws);
                    break;
                case "joinRoom":
                    await handleJoinRoom(user, payload, ws);
                    break;
                case "message":
                    await handleMessage(user, payload, ws);
                    break;
                case "command":
                    await handleCommand(user, payload, ws);
                    break;
                default:
                    sendError(ws, "Invalid request type.");
            }
        } catch (err) {
            console.error("Error handling message:", err);
            sendError(ws, "Invalid message format.");
        }
    });

    ws.on("close", () => {
        handleDisconnection(ws);
    });
});

// --- Handlers ---

async function handleRegister(payload: any, ws: WebSocket) {
    const { username, password } = payload;
    if (!username || !password) {
        return sendError(ws, "Username and password are required.");
    }
    if (await db.findUserByUsername(username)) {
        return sendError(ws, "Username is already taken.");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.createUser(username, hashedPassword);
    ws.send(JSON.stringify({ type: "registered", payload: { message: `User ${newUser.username} created successfully. Please log in.` } }));
}

async function handleLogin(payload: any, ws: WebSocket) {
    const { username, password } = payload;
    if (!username || !password) {
        return sendError(ws, "Username and password are required.");
    }
    const user = await db.findUserByUsername(username);
    if (!user || !await bcrypt.compare(password, user.password)) {
        return sendError(ws, "Invalid username or password.");
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    ws.send(JSON.stringify({ type: "loggedIn", payload: { token } }));
}

async function handleCreateRoom(user: AuthenticatedUser, payload: any, ws: WebSocket) {
    const { name } = payload;
    if (!name) return sendError(ws, "Room name is required.");

    const roomId = generateRoomId();
    const newDbRoom = await db.createRoom(roomId, name, user.id);

    chatRooms[roomId] = {
        id: roomId,
        name: newDbRoom.name,
        creatorId: newDbRoom.creatorId,
        users: [{ ...user, ws }],
    };

    ws.send(JSON.stringify({ type: "roomCreated", payload: { roomId, name } }));
    console.log(`Room "${name}" (${roomId}) created by ${user.username}.`);
}

async function handleJoinRoom(user: AuthenticatedUser, payload: any, ws: WebSocket) {
    const { roomId } = payload;
    const room = await db.findRoomById(roomId);
    if (!room) return sendError(ws, "Room not found.");

    // Add user to room in DB
    await db.addUserToRoom(roomId, user.id);

    // Add user to in-memory room, or create it if it's not active
    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { id: roomId, name: room.name, creatorId: room.creatorId, users: [] };
    }

    // Prevent duplicate users in memory
    if (!chatRooms[roomId].users.some(u => u.id === user.id)) {
        chatRooms[roomId].users.push({ ...user, ws });
    }

    ws.send(JSON.stringify({ type: "joinedRoom", payload: { roomId, name: room.name } }));

    // Send message history
    const history = await db.getMessageHistory(roomId);
    ws.send(JSON.stringify({ type: "history", payload: { roomId, messages: history.reverse() } }));

    broadcast(roomId, { type: "userJoined", payload: { username: user.username } }, user.id);
    console.log(`${user.username} joined room ${roomId}`);
}

async function handleMessage(user: AuthenticatedUser, payload: any, ws: WebSocket) {
    const { roomId, content } = payload;
    if (!chatRooms[roomId] || !content) return;

    const message = await db.createMessage(roomId, user.id, content);
    broadcast(roomId, { type: "message", payload: message });
}

async function handleCommand(user: AuthenticatedUser, payload: any, ws: WebSocket) {
    const { roomId, command } = payload;
    if (command === "/delete-room") {
        const room = await db.findRoomById(roomId);
        if (!room) return sendError(ws, "Room not found.");
        if (room.creatorId !== user.id) return sendError(ws, "Only the room creator can delete it.");

        broadcast(roomId, { type: "roomDeleted", payload: { message: `Room ${room.name} is being deleted by the creator.` } });
        await db.deleteRoom(roomId);
        delete chatRooms[roomId];
        console.log(`Room ${roomId} deleted by ${user.username}`);
    } else {
        sendError(ws, "Unknown command.");
    }
}

function handleDisconnection(ws: WebSocket) {
    const user = connectedUsers.get(ws);
    if (!user) return;

    connectedUsers.delete(ws);
    for (const roomId in chatRooms) {
        const room = chatRooms[roomId];
        const userIndex = room.users.findIndex((u) => u.id === user.id);
        if (userIndex !== -1) {
            room.users.splice(userIndex, 1);
            broadcast(roomId, { type: "userLeft", payload: { username: user.username } });
            console.log(`${user.username} left room ${roomId}.`);
            // If room is empty in memory, remove it to save resources
            if (room.users.length === 0) {
                delete chatRooms[roomId];
                console.log(`Deactivating empty room ${roomId} from memory.`);
            }
        }
    }
}

// --- Utility Functions ---

async function verifyToken(token: string, ws: WebSocket): Promise<AuthenticatedUser | null> {
    if (!token) {
        sendError(ws, "Authentication token is required.");
        return null;
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string, username: string };
        return { id: decoded.id, username: decoded.username, ws };
    } catch (error) {
        sendError(ws, "Invalid or expired token. Please log in again.");
        return null;
    }
}

function broadcast(roomId: string, message: object, excludeUserId?: string) {
    const room = chatRooms[roomId];
    if (!room) return;
    const data = JSON.stringify(message);
    room.users.forEach((user) => {
        if (user.id !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(data);
        }
    });
}

function sendError(ws: WebSocket, message: string) {
    ws.send(JSON.stringify({ type: "error", payload: { message } }));
}

function generateRoomId(): string {
    return crypto.randomBytes(4).toString("hex");
}

// Graceful shutdown
const shutdown = async () => {
    console.log('Shutting down gracefully...');
    await db.disconnectDB();
    wss.close(() => {
        process.exit(0);
    });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
