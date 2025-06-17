import { join } from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { StoredRoom } from './types';

// Define the schema for our database
type Data = {
    rooms: StoredRoom[];
};

// Initialize lowdb - create the adapter and db instance
const file = join(__dirname, 'db.json');
const adapter = new JSONFile<Data>(file);
const defaultData: Data = { rooms: [] };
const db = new Low(adapter, defaultData);

export async function initDB() {
    await db.read();
    db.data ||= defaultData;
    await db.write();
}

export async function saveRoom(roomId: string, creator: string) {
    db.data.rooms.push({ id: roomId, creator, messageHistory: [] });
    await db.write();
}

export async function appendMessage(roomId: string, message: string) {
    const room = db.data.rooms.find((r) => r.id === roomId);
    if (room) {
        room.messageHistory.push(message);
        await db.write();
    }
}

export async function deleteRoom(roomId: string) {
    db.data.rooms = db.data.rooms.filter((r) => r.id !== roomId);
    await db.write();
}

export async function roomExists(roomId: string): Promise<boolean> {
    return db.data.rooms.some((r) => r.id === roomId);
}

export async function getRoomCreator(roomId: string): Promise<string | undefined> {
    return db.data.rooms.find((r) => r.id === roomId)?.creator;
}

export async function getRoomHistory(roomId: string): Promise<string[]> {
    return db.data.rooms.find((r) => r.id === roomId)?.messageHistory || [];
}

export async function getAllRooms(): Promise<StoredRoom[]> {
    return [...db.data.rooms];
}