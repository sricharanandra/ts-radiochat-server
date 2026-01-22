import { WebSocket } from "ws";

// ============================================================================
// PROTOCOL TYPES - Fixed to use "type" and camelCase consistently
// ============================================================================

// Base message structure for all WebSocket communication
export interface BaseMessage<T = any> {
  type: string;
  payload: T;
}

// ============================================================================
// CLIENT → SERVER MESSAGES
// ============================================================================

export interface JoinRoomPayload {
  roomId?: string;  // Optional: can join by UUID
  roomName?: string; // Optional: can join by name (e.g., "general")
}

export interface SendMessagePayload {
  roomId: string;
  ciphertext: string;
  messageType?: "text" | "image";  // Type of message
  imageData?: string;              // Base64-encoded encrypted image data (for uploads)
}

export interface CreateRoomPayload {
  name: string;        // e.g., "team-chat"
  displayName?: string; // e.g., "#team-chat" (auto-generated if not provided)
  roomType: "public" | "private";
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface ListRoomsPayload {
  // Empty payload - just request the list
}

export interface TypingPayload {
  roomId: string;
}

export type ClientMessage =
  | BaseMessage<JoinRoomPayload> & { type: "joinRoom" }
  | BaseMessage<SendMessagePayload> & { type: "sendMessage" }
  | BaseMessage<CreateRoomPayload> & { type: "createRoom" }
  | BaseMessage<LeaveRoomPayload> & { type: "leaveRoom" }
  | BaseMessage<ListRoomsPayload> & { type: "listRooms" }
  | BaseMessage<TypingPayload> & { type: "typing" };

// ============================================================================
// SERVER → CLIENT MESSAGES
// ============================================================================

export interface MessagePayload {
  id: string;
  username: string;
  ciphertext: string;
  timestamp: string;
  messageType?: "text" | "image";  // Type of message
  imageUrl?: string;               // Object storage URL for images
  imageThumbnail?: string;         // Small base64 thumbnail for preview
}

export interface UserJoinedPayload {
  username: string;
  userId: string;
}

export interface UserLeftPayload {
  username: string;
  userId: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  roomName: string;
  displayName: string;  // e.g., "#general"
  roomType: string;     // "public" or "private"
  encryptedKey: string; // Server-managed room encryption key
  messages: MessagePayload[];
}

export interface RoomCreatedPayload {
  roomId: string;
  roomName: string;
  displayName: string;
  roomType: string;
  encryptedKey: string;
}

export interface RoomInfo {
  roomId: string;
  name: string;
  displayName: string;
  roomType: "public" | "private";
  memberCount: number;
  isJoined: boolean; // Whether the requesting user is a member
}

export interface RoomsListPayload {
  publicRooms: RoomInfo[];
  privateRooms: RoomInfo[]; // Only rooms the user is a member of
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface InfoPayload {
  message: string;
}

export interface UserTypingPayload {
  username: string;
  userId: string;
}

export type ServerMessage =
  | BaseMessage<MessagePayload> & { type: "message" }
  | BaseMessage<UserJoinedPayload> & { type: "userJoined" }
  | BaseMessage<UserLeftPayload> & { type: "userLeft" }
  | BaseMessage<RoomJoinedPayload> & { type: "roomJoined" }
  | BaseMessage<RoomCreatedPayload> & { type: "roomCreated" }
  | BaseMessage<RoomsListPayload> & { type: "roomsList" }
  | BaseMessage<ErrorPayload> & { type: "error" }
  | BaseMessage<InfoPayload> & { type: "info" }
  | BaseMessage<UserTypingPayload> & { type: "userTyping" };

// ============================================================================
// SERVER STATE TYPES
// ============================================================================

export interface ConnectedUser {
  userId: string;
  username: string;
  ws: WebSocket;
  currentRoomId: string | null;
  isAuthenticated: boolean;
}

export interface ActiveRoom {
  id: string;
  name: string;
  displayName: string;
  roomType: string;
  encryptedKey: string;
  users: ConnectedUser[];
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export interface AuthPayload {
  token: string;
}

export interface RegisterRequest {
  username: string;
  publicKey: string;
  keyType: "ed25519" | "rsa";
}

export interface RegisterResponse {
  userId: string;
  username: string;
  token: string;
}

export interface ChallengeRequest {
  username: string;
}

export interface ChallengeResponse {
  challenge: string;
}

export interface VerifyRequest {
  username: string;
  signature: string;
  publicKey: string;
}

export interface VerifyResponse {
  token: string;
  userId: string;
  username: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}
