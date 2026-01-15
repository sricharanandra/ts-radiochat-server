import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from './database';
import { JWTPayload, RegisterRequest, RegisterResponse, ChallengeResponse, VerifyResponse } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Store active challenges (username -> challenge)
const activeChallenges = new Map<string, { challenge: string; timestamp: number }>();
const CHALLENGE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// JWT TOKEN MANAGEMENT
// ============================================================================

export function generateToken(userId: string, username: string): string {
  const payload: JWTPayload = {
    userId,
    username,
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

// ============================================================================
// REGISTRATION (Simplified - no SSH key verification yet)
// ============================================================================

export async function registerUser(request: RegisterRequest): Promise<RegisterResponse> {
  // Check if username already exists
  const existingUser = await prisma.user.findUnique({
    where: { username: request.username },
  });

  if (existingUser) {
    throw new Error('Username already taken');
  }

  // Validate username
  if (!request.username || request.username.length < 3 || request.username.length > 32) {
    throw new Error('Username must be between 3 and 32 characters');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(request.username)) {
    throw new Error('Username can only contain letters, numbers, underscores, and hyphens');
  }

  // Store public key based on type
  const userData: any = {
    username: request.username,
  };

  if (request.keyType === 'ed25519') {
    userData.publicKeyEd25519 = request.publicKey;
  } else if (request.keyType === 'rsa') {
    userData.publicKeyRsa = request.publicKey;
  }

  // Create user in database
  const user = await prisma.user.create({
    data: userData,
  });

  // Generate JWT token
  const token = generateToken(user.id, user.username);

  return {
    userId: user.id,
    username: user.username,
    token,
  };
}

// ============================================================================
// AUTHENTICATION CHALLENGE-RESPONSE
// ============================================================================

export async function createChallenge(username: string): Promise<ChallengeResponse> {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Generate random challenge
  const challenge = crypto.randomBytes(32).toString('hex');

  // Store challenge with timestamp
  activeChallenges.set(username, {
    challenge,
    timestamp: Date.now(),
  });

  // Clean up old challenges
  cleanupOldChallenges();

  return { challenge };
}

export async function verifySignature(
  username: string,
  signature: string,
  publicKey: string
): Promise<VerifyResponse> {
  // Get stored challenge
  const challengeData = activeChallenges.get(username);
  
  if (!challengeData) {
    throw new Error('No active challenge found. Please request a new challenge.');
  }

  // Check if challenge has expired
  if (Date.now() - challengeData.timestamp > CHALLENGE_TIMEOUT) {
    activeChallenges.delete(username);
    throw new Error('Challenge expired. Please request a new challenge.');
  }

  // Get user from database
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Verify that the public key matches
  if (user.publicKeyEd25519 !== publicKey && user.publicKeyRsa !== publicKey) {
    throw new Error('Public key does not match');
  }

  // TODO: Implement actual signature verification
  // For now, we'll skip signature verification to get the system working
  // In production, you would verify the signature using the public key
  
  console.log(`[AUTH] User ${username} authenticated (signature verification skipped for development)`);

  // Remove used challenge
  activeChallenges.delete(username);

  // Update last seen
  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeen: new Date() },
  });

  // Generate JWT token
  const token = generateToken(user.id, user.username);

  return {
    token,
    userId: user.id,
    username: user.username,
  };
}

// ============================================================================
// SIMPLIFIED LOGIN (For development - no signature required)
// ============================================================================

export async function simpleLogin(username: string): Promise<VerifyResponse> {
  // Get user from database
  let user = await prisma.user.findUnique({
    where: { username },
  });

  // If user doesn't exist, create them automatically (dev mode)
  if (!user) {
    console.log(`[AUTH] Creating new user: ${username}`);
    user = await prisma.user.create({
      data: {
        username,
      },
    });
  }

  // Update last seen
  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeen: new Date() },
  });

  // Generate JWT token
  const token = generateToken(user.id, user.username);

  return {
    token,
    userId: user.id,
    username: user.username,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

function cleanupOldChallenges() {
  const now = Date.now();
  for (const [username, data] of activeChallenges.entries()) {
    if (now - data.timestamp > CHALLENGE_TIMEOUT) {
      activeChallenges.delete(username);
    }
  }
}

// Periodic cleanup every 5 minutes
setInterval(cleanupOldChallenges, 5 * 60 * 1000);
