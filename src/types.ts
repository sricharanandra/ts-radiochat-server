import { WebSocket } from "ws";
import { Room, User as DbUser, Message } from "@prisma/client";

// Represents a user connected to the server via WebSocket
export type AuthenticatedUser = {
    id: string;
    username: string;
    ws: WebSocket;
};
// In-memory representation of an active chat room
export type ChatRoom = {
    id: string;
    name: string;
    creatorId: string;
    users: AuthenticatedUser[];
    pendingJoins: AuthenticatedUser[];
    // We no longer store message history in memory; we fetch it from DB
};
export type MessageWithAuthor = Message & {
    author: {
        username: string;
    };
};
