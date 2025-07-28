import { WebSocket } from "ws";

export interface ConnectedUser {
    username: string;
    ws: WebSocket;
    currentRoom: string | null;
}

export interface ChatRoom {
    id: string;
    name: string;
    creator: string;
    users: ConnectedUser[];
    messages: Message[];
}

export interface Message {
    id: string;
    username: string;
    content: string;
    timestamp: string;
}