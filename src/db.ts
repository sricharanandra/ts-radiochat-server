import { PrismaClient } from "@prisma/client";
import { StoredRoom } from "./types"

const prisma = new PrismaClient();

export async function initDB() {
    try {
        await prisma.$connect()
        console.log("Connected to Postgres ")
    } catch (error) {
        console.log("Error connecting to Postgres", error)
        throw error;
    }
}

export async function saveRoom(roomId: string, creator: string) {
    await prisma.room.create({
        data: {
            id: roomId,
            creator,
            messageHistory: []
        }
    })
}

export async function roomExists(roomId: string) {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
    });
    return room !== null;
}

export async function appendMessage(roomId: string, message: string) {
    const room = await prisma.room.findUnique({
        where: { id: roomId }
    });

    if (room) {
        // Ensure all elements are strings and create a new array
        const currentHistory: string[] = room.messageHistory.map(msg => String(msg));
        const updatedHistory: string[] = [...currentHistory, message];

        await prisma.room.update({
            where: { id: roomId },
            data: {
                messageHistory: updatedHistory
            }
        });
    }
}

export async function deleteRoom(roomId: string) {
    await prisma.room.delete({
        where: { id: roomId }
    })
}
export async function getRoomCreator(roomId: string): Promise<string | undefined> {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { creator: true }
    });
    return room?.creator;
}

export async function getRoomHistory(roomId: string): Promise<string[]> {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { messageHistory: true }
    });
    return room?.messageHistory || [];
}

export async function getAllRooms(): Promise<StoredRoom[]> {
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
export async function disconnectDB() {
    await prisma.$disconnect();
}

// Export prisma instance for advanced queries if needed
export { prisma };
