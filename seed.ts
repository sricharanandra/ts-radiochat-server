import { prisma } from './src/database';
import crypto from 'crypto';

// Generate a random AES-256 key for room encryption
function generateRoomKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function seed() {
  console.log('🌱 Seeding database...');

  // Create test users
  const alice = await prisma.user.create({
    data: {
      username: 'alice',
    },
  });

  const bob = await prisma.user.create({
    data: {
      username: 'bob',
    },
  });

  const charlie = await prisma.user.create({
    data: {
      username: 'charlie',
    },
  });

  console.log(`✅ Created users: ${alice.username}, ${bob.username}, ${charlie.username}`);

  // Create public rooms
  const generalRoom = await prisma.room.create({
    data: {
      name: 'general',
      displayName: '#general',
      roomType: 'public',
      encryptedKey: generateRoomKey(),
      creatorId: alice.id,
      members: {
        create: [
          { userId: alice.id },
          { userId: bob.id },
          { userId: charlie.id },
        ],
      },
    },
  });

  const randomRoom = await prisma.room.create({
    data: {
      name: 'random',
      displayName: '#random',
      roomType: 'public',
      encryptedKey: generateRoomKey(),
      creatorId: alice.id,
      members: {
        create: [
          { userId: alice.id },
          { userId: bob.id },
        ],
      },
    },
  });

  // Create private room
  const privateRoom = await prisma.room.create({
    data: {
      name: 'project-alpha',
      displayName: '#project-alpha',
      roomType: 'private',
      encryptedKey: generateRoomKey(),
      creatorId: alice.id,
      members: {
        create: [
          { userId: alice.id },
          { userId: bob.id },
        ],
      },
    },
  });

  console.log(`✅ Created public rooms: ${generalRoom.displayName}, ${randomRoom.displayName}`);
  console.log(`✅ Created private room: ${privateRoom.displayName}`);
  console.log('\n📝 Test Rooms Info:');
  console.log(`   ${generalRoom.displayName} - ${generalRoom.name} (${generalRoom.roomType})`);
  console.log(`   ${randomRoom.displayName} - ${randomRoom.name} (${randomRoom.roomType})`);
  console.log(`   ${privateRoom.displayName} - ${privateRoom.name} (${privateRoom.roomType})`);
  console.log('\n✨ Database seeded successfully!');
  console.log('\n💡 Try joining with room names like "general", "random", or "project-alpha"');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
