import { PrismaClient, User } from "@prisma/client";
import { MessageWithAuthor } from "./types";

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
// --- User Functions ---
export async function findUserByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { username } });
}

export async function createUser(username: string, hashedPassword_ts: string): Promise<User> {
    return prisma.user.create({
        data: {
            username,
            password: hashedPassword_ts,
        },
    });
}

// --- Room Functions ---
export async function createRoom(roomId: string, name: string, creatorId: string) {
    return prisma.room.create({
        data: {
            id: roomId,
            name,
            creatorId,
            members: {
                connect: { id: creatorId }
            }
        }
    });
}

export async function findRoomById(roomId: string) {
    return prisma.room.findUnique({ where: { id: roomId } });
}

export async function addUserToRoom(roomId: string, userId: string) {
    return prisma.room.update({
        where: { id: roomId },
        data: {
            members: {
                connect: { id: userId }
            }
        }
    });
}

export async function deleteRoom(roomId: string) {
    // Transactions ensure that all related messages are deleted before the room is.
    return prisma.$transaction([
        prisma.message.deleteMany({ where: { roomId } }),
        prisma.room.delete({ where: { id: roomId } })
    ]);
}

export async function getRoomWithMembers(roomId: string) {
    return prisma.room.findUnique({
        where: { id: roomId },
        include: { members: { select: { id: true, username: true } } }
    });
}

// --- Message Functions ---
export async function createMessage(roomId: string, authorId: string, content: string): Promise<MessageWithAuthor> {
    return prisma.message.create({
        data: {
            content,
            roomId,
            authorId,
        },
        include: {
            author: {
                select: { username: true }
            }
        }
    });
}

export async function getMessageHistory(roomId: string, limit: number = 50): Promise<MessageWithAuthor[]> {
    return prisma.message.findMany({
        where: { roomId },
        take: limit,
        orderBy: { createdAt: 'desc' }, // Get the most recent messages
        include: {
            author: {
                select: { username: true }
            }
        }
    });
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
