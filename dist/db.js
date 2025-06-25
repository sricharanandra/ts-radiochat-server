"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.initDB = initDB;
exports.saveRoom = saveRoom;
exports.roomExists = roomExists;
exports.appendMessage = appendMessage;
exports.deleteRoom = deleteRoom;
exports.getRoomCreator = getRoomCreator;
exports.getRoomHistory = getRoomHistory;
exports.getAllRooms = getAllRooms;
exports.disconnectDB = disconnectDB;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
exports.prisma = prisma;
async function initDB() {
    try {
        await prisma.$connect();
        console.log("Connected to Postgres ");
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
    await prisma.$disconnect();
}
//# sourceMappingURL=db.js.map