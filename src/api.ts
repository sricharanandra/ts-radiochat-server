import express, { Request, Response } from 'express';
import cors from 'cors';
import { registerUser, createChallenge, verifySignature, simpleLogin } from './auth';
import { prisma } from './database';
import { RegisterRequest, ChallengeRequest, VerifyRequest } from './types';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

// Register new user
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const request: RegisterRequest = req.body;
    
    if (!request.username || !request.publicKey || !request.keyType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const response = await registerUser(request);
    res.json(response);
  } catch (error: any) {
    console.error('[API] Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get authentication challenge
app.post('/api/auth/challenge', async (req: Request, res: Response) => {
  try {
    const { username }: ChallengeRequest = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    const response = await createChallenge(username);
    res.json(response);
  } catch (error: any) {
    console.error('[API] Challenge error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Verify signature and login
app.post('/api/auth/verify', async (req: Request, res: Response) => {
  try {
    const { username, signature, publicKey }: VerifyRequest = req.body;
    
    if (!username || !signature || !publicKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const response = await verifySignature(username, signature, publicKey);
    res.json(response);
  } catch (error: any) {
    console.error('[API] Verification error:', error);
    res.status(401).json({ error: error.message });
  }
});

// Simplified login (for development)
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    const response = await simpleLogin(username);
    res.json(response);
  } catch (error: any) {
    console.error('[API] Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// ROOM ENDPOINTS
// ============================================================================

// Get rooms list (public + user's private rooms)
app.get('/api/rooms', async (req: Request, res: Response) => {
  try {
    // TODO: Add auth middleware to get userId from token
    // For now, return all public rooms and sample of private
    
    const roomType = req.query.type as string | undefined;
    
    const where: any = { deletedAt: null };
    if (roomType === 'public' || roomType === 'private') {
      where.roomType = roomType;
    }

    const rooms = await prisma.room.findMany({
      where,
      include: {
        creator: {
          select: { username: true },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedRooms = rooms.map(room => ({
      roomId: room.id,
      name: room.name,
      displayName: room.displayName,
      roomType: room.roomType,
      creator: room.creator.username,
      memberCount: room._count.members,
      createdAt: room.createdAt.toISOString(),
    }));

    res.json(formattedRooms);
  } catch (error: any) {
    console.error('[API] Get rooms error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get room messages
app.get('/api/rooms/:roomId/messages', async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string;
    const limitQuery = req.query.limit;
    const limit = (typeof limitQuery === 'string') ? parseInt(limitQuery) : 50;

    const messages = await prisma.message.findMany({
      where: { roomId },
      include: {
        sender: {
          select: { username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Reverse to get chronological order
    const formattedMessages = messages.reverse().map(m => ({
      id: m.id,
      username: m.sender.username,
      ciphertext: m.ciphertext,
      timestamp: m.createdAt.toISOString(),
    }));

    res.json(formattedMessages);
  } catch (error: any) {
    console.error('[API] Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
