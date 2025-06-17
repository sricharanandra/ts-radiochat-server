import { WebSocket } from "ws";

export type User = {
    username: string;
    ws: WebSocket;
};

export type StoredRoom = {
    id: string;
    creator: string;
    messageHistory: string[];
};

export type ChatRoom = {
    id: string;
    creator: User;
    users: User[];
    pendingRequests: User[];
    messageHistory: string[];
};