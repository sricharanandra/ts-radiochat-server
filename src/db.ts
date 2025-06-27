import { PrismaClient } from "@prisma/client";
import { StoredRoom } from "./types"

let prisma: PrismaClient;

export async function initDB() {
    try {
        // Create the PrismaClient here, after environment variables are loaded
        if (!prisma) {
            prisma = new PrismaClient({
                log: ['error', 'warn'],
            });
        }

        await prisma.$connect();
        console.log("Connected to Postgres successfully!");
        console.log("Database URL configured:", process.env.DATABASE_URL ? "YES" : "NO");
    } catch (error) {
        console.log("Error connecting to Postgres", error);
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
    if (prisma) {
        await prisma.$disconnect();
    }
}

export function getPrismaClient() {
    if (!prisma) {
        throw new Error("Database not initialized. Call initDB() first.");
    }
    return prisma;
}
