import { PrismaClient } from "@prisma/client";
import { StoredRoom } from "./types";
export declare function initDB(): Promise<void>;
export declare function saveRoom(roomId: string, creator: string): Promise<void>;
export declare function roomExists(roomId: string): Promise<boolean>;
export declare function appendMessage(roomId: string, message: string): Promise<void>;
export declare function deleteRoom(roomId: string): Promise<void>;
export declare function getRoomCreator(roomId: string): Promise<string | undefined>;
export declare function getRoomHistory(roomId: string): Promise<string[]>;
export declare function getAllRooms(): Promise<StoredRoom[]>;
export declare function disconnectDB(): Promise<void>;
export declare function getPrismaClient(): PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
//# sourceMappingURL=db.d.ts.map