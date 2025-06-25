"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDB = initDB;
exports.saveRoom = saveRoom;
exports.appendMessage = appendMessage;
exports.deleteRoom = deleteRoom;
exports.roomExists = roomExists;
exports.getRoomCreator = getRoomCreator;
exports.getRoomHistory = getRoomHistory;
exports.getAllRooms = getAllRooms;
const path_1 = require("path");
const lowdb_1 = require("lowdb");
const node_1 = require("lowdb/node");
// Initialize lowdb - create the adapter and db instance
const file = (0, path_1.join)(__dirname, 'db.json');
const adapter = new node_1.JSONFile(file);
const defaultData = { rooms: [] };
const db = new lowdb_1.Low(adapter, defaultData);
async function initDB() {
    await db.read();
    db.data || (db.data = defaultData);
    await db.write();
}
async function saveRoom(roomId, creator) {
    db.data.rooms.push({ id: roomId, creator, messageHistory: [] });
    await db.write();
}
async function appendMessage(roomId, message) {
    const room = db.data.rooms.find((r) => r.id === roomId);
    if (room) {
        room.messageHistory.push(message);
        await db.write();
    }
}
async function deleteRoom(roomId) {
    db.data.rooms = db.data.rooms.filter((r) => r.id !== roomId);
    await db.write();
}
async function roomExists(roomId) {
    return db.data.rooms.some((r) => r.id === roomId);
}
async function getRoomCreator(roomId) {
    var _a;
    return (_a = db.data.rooms.find((r) => r.id === roomId)) === null || _a === void 0 ? void 0 : _a.creator;
}
async function getRoomHistory(roomId) {
    var _a;
    return ((_a = db.data.rooms.find((r) => r.id === roomId)) === null || _a === void 0 ? void 0 : _a.messageHistory) || [];
}
async function getAllRooms() {
    return [...db.data.rooms];
}
