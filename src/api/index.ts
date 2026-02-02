#!/usr/bin/env node

import { ApiServer } from './server';

/**
 * Entry point for the Domain Availability Checker API Server
 */
async function main() {
  const port = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3001;
  
  console.log('🚀 Starting Domain Availability Checker API Server...');
  console.log(`📡 Port: ${port}`);
  console.log(`🌐 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  
  const server = new ApiServer(port);
  
  // Graceful shutdown handling
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
  
  try {
    await server.start();
  } catch (error) {
    console.error('❌ Failed to start API server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});