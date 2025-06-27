import { WebSocketServer, WebSocket } from "ws";
import dotenv from 'dotenv';
import crypto from "crypto";
// Load environment variables FIRST, before any database imports
dotenv.config();

import {
    saveRoom,
    roomExists,
    appendMessage,
    deleteRoom as deleteStoredRoom,
    getRoomCreator,
    getRoomHistory,
    getAllRooms,
    initDB,
    disconnectDB
} from "./db";
import { ChatRoom, User, StoredRoom } from "./types";

const chatRooms: Record<string, ChatRoom> = {};
const wss = new WebSocketServer({ port: 8080, host: '0.0.0.0' });
const message_history_limit = 50;

// Initialize the database and load existing rooms
async function initialize() {
    try {
        console.log("Initializing server...");
        console.log("DATABASE_URL configured:", process.env.DATABASE_URL ? "YES" : "NO");
        console.log("DATABASE_URL uses socket:", process.env.DATABASE_URL?.includes('host=/') ? "YES" : "NO");
        await initDB();
        await loadExistingRooms();
        console.log("Server started successfully on port 8080.");
    } catch (error) {
        console.error("Failed to initialize server:", error);
        process.exit(1);
    }
}
// Load rooms from the database on startup
async function loadExistingRooms() {
    const storedRooms = await getAllRooms();
    console.log(`Loading ${storedRooms.length} existing rooms from database`);

    storedRooms.forEach(room => {
        // Create in-memory representation with empty users list
        chatRooms[room.id] = {
            id: room.id,
            creator: { username: room.creator, ws: null as unknown as WebSocket },
            users: [],
            pendingRequests: [],
            messageHistory: [...room.messageHistory]
        };
    });
}

// Start the server
initialize();

wss.on("connection", (ws: WebSocket) => {
    ws.on("message", async (data: string) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case "createRoom":
                    await createRoom(message.payload.username, ws);
                    break;
                case "joinRoom":
                    await joinRoom(message.payload.username, message.payload.roomId, ws);
                    break;
                case "approveJoin":
                    approveJoinRequest(message.payload.roomId, message.payload.username);
                    break;
                case "message":
                    await broadcastMessage(message.payload.roomId, message.payload.sender, message.payload.message);
                    break;
                case "command":
                    await handleClientCommand(message.payload.command, message.payload.sender, ws, message.payload.roomId);
                    break;
                default:
                    ws.send(JSON.stringify({ type: "error", payload: "Invalid request type." }));
            }
        } catch (err) {
            console.error("Error handling message:", err);
            ws.send(JSON.stringify({ type: "error", payload: "Invalid message format." }));
        }
    });

    ws.on("close", () => {
        handleDisconnection(ws);
    });
});

async function createRoom(username: string, ws: WebSocket) {
    const roomId = generateRoomId();

    if (await roomExists(roomId)) {
        ws.send(JSON.stringify({ type: "error", payload: "Room ID collision, try again." }));
        return;
    }

    const newRoom: ChatRoom = {
        id: roomId,
        creator: { username, ws },
        users: [{ username, ws }],
        pendingRequests: [],
        messageHistory: [],
    };

    chatRooms[roomId] = newRoom;
    await saveRoom(roomId, username); // Store just the username as creator

    ws.send(JSON.stringify({ type: "roomCreated", payload: { roomId } }));
    console.log(`Room ${roomId} created by ${username}.`);
}

async function joinRoom(username: string, roomId: string, ws: WebSocket) {
    // First check if the room exists in the database
    if (!(await roomExists(roomId))) {
        ws.send(JSON.stringify({ type: "error", payload: "Room does not exist." }));
        return;
    }

    // Create the room in memory if it's not already there
    if (!chatRooms[roomId]) {
        const creator = await getRoomCreator(roomId);
        const history = await getRoomHistory(roomId);

        chatRooms[roomId] = {
            id: roomId,
            creator: { username: creator || "unknown", ws: null as unknown as WebSocket },
            users: [],
            pendingRequests: [],
            messageHistory: [...history]
        };
    }

    const room = chatRooms[roomId];

    if (room.users.some(user => user.username === username)) {
        ws.send(JSON.stringify({ type: "error", payload: "Username already exists in this room." }));
        return;
    }

    // Update creator's websocket if they're rejoining
    if (room.creator.username === username) {
        room.creator.ws = ws;
    }

    room.pendingRequests.push({ username, ws });

    // If no users in room (everyone left but room persists), auto-approve the first person
    if (room.users.length === 0) {
        approveJoinRequest(roomId, username);
    } else {
        promptNextJoinRequest(room);
    }

    console.log(`${username} requested to join room ${roomId}.`);
}

function promptNextJoinRequest(room: ChatRoom) {
    if (room.pendingRequests.length > 0 && room.users.length > 0) {
        // If creator is in the room, send request to them
        const creatorInRoom = room.users.find(user => user.username === room.creator.username);
        if (creatorInRoom) {
            const nextRequest = room.pendingRequests[0];
            creatorInRoom.ws.send(JSON.stringify({
                type: "joinRequest",
                payload: { username: nextRequest.username },
            }));
        } else {
            // If creator is not in room but others are, send to first user
            const nextRequest = room.pendingRequests[0];
            room.users[0].ws.send(JSON.stringify({
                type: "joinRequest",
                payload: { username: nextRequest.username },
            }));
        }
    }
}

function approveJoinRequest(roomId: string, username: string) {
    const room = chatRooms[roomId];
    if (!room) return;

    const requestIndex = room.pendingRequests.findIndex((user) => user.username === username);
    if (requestIndex !== -1) {
        const approvedUser = room.pendingRequests.splice(requestIndex, 1)[0];
        room.users.push(approvedUser);

        approvedUser.ws.send(JSON.stringify({
            type: "joinApproved",
            payload: { roomId },
        }));

        // Send room history to the new user
        sendRoomHistory(approvedUser.ws, room);

        broadcastMessage(roomId, "Server", `${username} has joined the room.`);
        console.log(`${username} has been admitted to room ${roomId}.`);

        promptNextJoinRequest(room);
    }
}

function sendRoomHistory(ws: WebSocket, room: ChatRoom) {
    if (room.messageHistory.length > 0) {
        ws.send(JSON.stringify({
            type: "message",
            payload: {
                sender: "Server",
                message: "--- Chat History ---"
            }
        }));

        room.messageHistory.forEach(message => {
            ws.send(JSON.stringify({
                type: "message",
                payload: {
                    sender: "History",
                    message
                }
            }));
        });

        ws.send(JSON.stringify({
            type: "message",
            payload: {
                sender: "Server",
                message: "--- End of History ---"
            }
        }));
    }
}

async function broadcastMessage(roomId: string, sender: string, message: string) {
    const room = chatRooms[roomId];
    if (!room) return;

    const formattedMessage = `${sender}: ${message}`;
    room.messageHistory.push(formattedMessage);

    // Persist message in database
    await appendMessage(roomId, formattedMessage);

    if (room.messageHistory.length > message_history_limit) {
        room.messageHistory.shift();
    }

    room.users.forEach((user) => {
        user.ws.send(JSON.stringify({
            type: "message",
            payload: { sender, message: formattedMessage },
        }));
    });
}

function handleDisconnection(ws: WebSocket) {
    for (const roomId in chatRooms) {
        const room = chatRooms[roomId];
        const userIndex = room.users.findIndex((user) => user.ws === ws);

        if (userIndex !== -1) {
            const user = room.users.splice(userIndex, 1)[0];
            broadcastMessage(roomId, "Server", `${user.username} has left the room.`);

            // If this was the creator, update their websocket to null
            if (room.creator.username === user.username) {
                room.creator.ws = null as unknown as WebSocket;
            }

            // We don't delete the room even if empty now - it persists
            console.log(`${user.username} left room ${roomId}. Room persists with ${room.users.length} active users.`);
            return;
        }
    }
}

async function handleClientCommand(command: string, sender: string, ws: WebSocket, roomId: string) {
    if (command === "/delete-room") {
        // Get the room creator from the database for verification
        const creatorUsername = await getRoomCreator(roomId);

        // Only the original creator can delete the room
        if (!creatorUsername || creatorUsername !== sender) {
            ws.send(JSON.stringify({
                type: "error",
                payload: "Only the room creator can delete the room.",
            }));
            return;
        }

        const room = chatRooms[roomId];
        if (room) {
            room.users.forEach((user) => {
                user.ws.send(JSON.stringify({
                    type: "message",
                    payload: {
                        sender: "Server",
                        message: `Room ${roomId} is being deleted by the admin.`,
                    },
                }));
            });
        }

        // Delete from memory and database
        delete chatRooms[roomId];
        await deleteStoredRoom(roomId);

        console.log(`Room ${roomId} deleted by admin ${sender}`);

        ws.send(JSON.stringify({
            type: "message",
            payload: {
                sender: "Server",
                message: `Room ${roomId} successfully deleted.`,
            },
        }));
    } else {
        ws.send(JSON.stringify({
            type: "error",
            payload: "Unknown command. Available commands: /delete-room"
        }));
    }
}

function generateRoomId(): string {
    return crypto.randomBytes(4).toString("hex").slice(0, 7);
}


// PRISMA RELATED
// Add graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await disconnectDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await disconnectDB();
    process.exit(0);
});
