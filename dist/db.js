"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDB = initDB;
exports.saveRoom = saveRoom;
exports.roomExists = roomExists;
exports.appendMessage = appendMessage;
exports.deleteRoom = deleteRoom;
exports.getRoomCreator = getRoomCreator;
exports.getRoomHistory = getRoomHistory;
exports.getAllRooms = getAllRooms;
exports.disconnectDB = disconnectDB;
exports.getPrismaClient = getPrismaClient;
const client_1 = require("@prisma/client");
let prisma;
async function initDB() {
    try {
        // Create the PrismaClient here, after environment variables are loaded
        if (!prisma) {
            prisma = new client_1.PrismaClient({
                log: ['error', 'warn'],
            });
        }
        await prisma.$connect();
        console.log("Connected to Postgres successfully!");
        console.log("Database URL configured:", process.env.DATABASE_URL ? "YES" : "NO");
    }
    catch (error) {
        console.log("Error connecting to Postgres", error);
        throw error;
    }
}
async function saveRoom(roomId, creator) {
    await prisma.room.create({
        data: {
            id: roomId,
            creator,
            messageHistory: []
        }
    });
}
async function roomExists(roomId) {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
    });
    return room !== null;
}
async function appendMessage(roomId, message) {
    const room = await prisma.room.findUnique({
        where: { id: roomId }
    });
    if (room) {
        // Ensure all elements are strings and create a new array
        const currentHistory = room.messageHistory.map(msg => String(msg));
        const updatedHistory = [...currentHistory, message];
        await prisma.room.update({
            where: { id: roomId },
            data: {
                messageHistory: updatedHistory
            }
        });
    }
}
async function deleteRoom(roomId) {
    await prisma.room.delete({
        where: { id: roomId }
    });
}
async function getRoomCreator(roomId) {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { creator: true }
    });
    return room?.creator;
}
async function getRoomHistory(roomId) {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { messageHistory: true }
    });
    return room?.messageHistory || [];
}
async function getAllRooms() {
    const rooms = await prisma.room.findMany({
        select: {
            id: true,
            creator: true,
            messageHistory: true
        }
    });
    return rooms.map(room => ({
        id: room.id,
        creator: room.creator,
        messageHistory: room.messageHistory
    }));
}
// Graceful shutdown
async function disconnectDB() {
    if (prisma) {
        await prisma.$disconnect();
    }
}
function getPrismaClient() {
    if (!prisma) {
        throw new Error("Database not initialized. Call initDB() first.");
    }
    return prisma;
}
//# sourceMappingURL=db.js.map