#!/usr/bin/env node
/**
 * Eurus User Registration CLI
 * 
 * Registers a new user with their SSH public key.
 * 
 * Usage:
 *   node dist/cli/register.js --username <username> --key-file <path-to-public-key>
 *   node dist/cli/register.js --username <username> --key <public-key-string>
 * 
 * Example:
 *   node dist/cli/register.js --username alice --key-file ~/.ssh/id_ed25519.pub
 */
import * as fs from 'fs';
import * as path from 'path';
interface RegisterRequest {
  username: string;
  publicKey: string;
  keyType: "ed25519" | "rsa";
}
interface RegisterResponse {
  userId: string;
  username: string;
  token: string;
}
interface ErrorResponse {
  error: string;
}
/**
 * Parse command line arguments
 */
function parseArgs(): { username?: string; keyFile?: string; key?: string; serverUrl?: string } {
  const args = process.argv.slice(2);
  const result: { username?: string; keyFile?: string; key?: string; serverUrl?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--username' && i + 1 < args.length) {
      result.username = args[++i];
    } else if (arg === '--key-file' && i + 1 < args.length) {
      result.keyFile = args[++i];
    } else if (arg === '--key' && i + 1 < args.length) {
      result.key = args[++i];
    } else if (arg === '--server' && i + 1 < args.length) {
      result.serverUrl = args[++i];
    }
  }
  return result;
}
/**
 * Detect SSH key type from public key string
 */
function detectKeyType(publicKey: string): "ed25519" | "rsa" | null {
  if (publicKey.startsWith('ssh-ed25519')) {
    return 'ed25519';
  } else if (publicKey.startsWith('ssh-rsa')) {
    return 'rsa';
  }
  return null;
}
/**
 * Read public key from file
 */
function readPublicKey(keyFile: string): string {
  try {
    // Expand ~ to home directory
    const expandedPath = keyFile.startsWith('~')
      ? path.join(process.env.HOME || '', keyFile.slice(1))
      : keyFile;
    const content = fs.readFileSync(expandedPath, 'utf-8').trim();
    return content;
  } catch (error: any) {
    console.error(`Error reading key file: ${error.message}`);
    process.exit(1);
  }
}
/**
 * Register user via REST API
 */
async function registerUser(serverUrl: string, username: string, publicKey: string): Promise<void> {
  const keyType = detectKeyType(publicKey);
  
  if (!keyType) {
    console.error('Error: Invalid public key format. Must start with ssh-ed25519 or ssh-rsa');
    process.exit(1);
  }
  const requestBody: RegisterRequest = {
    username,
    publicKey,
    keyType
  };
  try {
    const response = await fetch(`${serverUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    if (!response.ok) {
      const errorData = data as ErrorResponse;
      console.error(`Registration failed: ${errorData.error || 'Unknown error'}`);
      process.exit(1);
    }
    const registerData = data as RegisterResponse;
    
    console.log('✅ Registration successful!');
    console.log('');
    console.log('User Details:');
    console.log(`  Username: ${registerData.username}`);
    console.log(`  User ID:  ${registerData.userId}`);
    console.log('');
    console.log('JWT Token (save this for authentication):');
    console.log(`  ${registerData.token}`);
    console.log('');
    console.log('You can now connect with the Eurus TUI client.');
    
  } catch (error: any) {
    console.error(`Error connecting to server: ${error.message}`);
    process.exit(1);
  }
}
/**
 * Display usage information
 */
function showUsage(): void {
  console.log('Eurus User Registration CLI');
  console.log('');
  console.log('Usage:');
  console.log('  register --username <username> --key-file <path-to-public-key> [--server <url>]');
  console.log('  register --username <username> --key <public-key-string> [--server <url>]');
  console.log('');
  console.log('Options:');
  console.log('  --username    Username for the new user');
  console.log('  --key-file    Path to SSH public key file (e.g., ~/.ssh/id_ed25519.pub)');
  console.log('  --key         SSH public key string directly');
  console.log('  --server      Server URL (default: http://localhost:8081)');
  console.log('');
  console.log('Examples:');
  console.log('  register --username alice --key-file ~/.ssh/id_ed25519.pub');
  console.log('  register --username bob --key-file ~/.ssh/id_rsa.pub --server https://eurus.example.com');
  console.log('');
  console.log('Supported key types: Ed25519, RSA');
  process.exit(1);
}
/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();
  // Validate arguments
  if (!args.username) {
    console.error('Error: --username is required');
    showUsage();
  }
  if (!args.keyFile && !args.key) {
    console.error('Error: Either --key-file or --key is required');
    showUsage();
  }
  // Read public key
  const publicKey = args.key || readPublicKey(args.keyFile!);
  // Default server URL
  const serverUrl = args.serverUrl || process.env.EURUS_SERVER_URL || 'http://localhost:8081';
  console.log(`Registering user: ${args.username}`);
  console.log(`Server: ${serverUrl}`);
  console.log('');
  await registerUser(serverUrl, args.username, publicKey);
}
// Run CLI
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
