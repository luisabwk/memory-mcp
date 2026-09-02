/**
 * Basic integration smoke test for the memory system (manual, not part of `npm test`
 * — vitest only picks up *.test.ts). Exercises a real MongoDB + OpenRouter connection.
 * Run with: npm run build && MONGODB_URI=... MONGODB_DB=... node dist/test.js
 */

import { getMongoDb } from './services/mongo.js';
import { MongoMemoryService } from './services/mongo-memory.js';
import { EmbeddingsService } from './services/embeddings.js';
import { SectorClassifier } from './services/classifier.js';
import * as dotenv from 'dotenv';

dotenv.config();

// Test configuration
const testConfig = {
  openrouterKey: process.env.OPENROUTER_API_KEY!,
};
const TEST_USER_ID = process.env.MIGRATION_OWNER_EMAIL || 'luisa.barwinski@gmail.com';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function runTests() {
  log('\n Running Memory System Integration Tests\n', colors.blue);

  try {
    // Initialize services
    log('1. Initializing services...', colors.yellow);
    const db = await getMongoDb();
    const memoryService = new MongoMemoryService(db);
    const embeddings = new EmbeddingsService({
      apiKey: testConfig.openrouterKey,
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    });
    const classifier = new SectorClassifier();
    log('Services initialized', colors.green);

    // Test 1: Classifier
    log('\n2. Testing Sector Classifier...', colors.yellow);
    const testTexts = [
      'Tivemos uma reunião hoje sobre o projeto',
      'Como configurar o banco de dados PostgreSQL',
      'Prefiro usar TypeScript em vez de JavaScript',
      'Aprendi que é importante fazer code reviews',
      'PostgreSQL é um banco de dados relacional'
    ];

    for (const text of testTexts) {
      const result = classifier.classifyWithConfidence(text);
      log(`  "${text.substring(0, 50)}..." -> ${result.sector} (${(result.confidence * 100).toFixed(0)}%)`, colors.reset);
    }
    log('Classifier working', colors.green);

    // Test 2: Embeddings
    log('\n3. Testing Embeddings Service...', colors.yellow);
    const embedding = await embeddings.generateEmbedding('Test memory content');
    log(`  Generated embedding with ${embedding.length} dimensions`, colors.reset);
    if (embedding.length !== 1536) {
      throw new Error(`Expected 1536 dimensions, got ${embedding.length}`);
    }
    log('Embeddings working', colors.green);

    // Test 3: Store Memory
    log('\n4. Testing Store Memory...', colors.yellow);
    const testMemory = {
      content: 'Test memory from integration tests - can be deleted',
      embedding,
      sector: 'semantic' as const,
      source_type: 'global' as const,
      metadata: { test: true, timestamp: new Date().toISOString() },
      tags: ['test', 'integration'],
      user_id: TEST_USER_ID,
    };

    const stored = await memoryService.storeMemory(testMemory);
    log(`  Stored memory with ID: ${stored.id}`, colors.reset);
    log('Store memory working', colors.green);

    // Test 4: Get Memory
    log('\n5. Testing Get Memory...', colors.yellow);
    const retrieved = await memoryService.getMemory(stored.id, TEST_USER_ID);
    if (retrieved.content !== testMemory.content) {
      throw new Error('Retrieved memory content does not match');
    }
    log(`  Retrieved memory: ${retrieved.content.substring(0, 50)}...`, colors.reset);
    log('Get memory working', colors.green);

    // Test 5: List Memories
    log('\n6. Testing List Memories...', colors.yellow);
    const listed = await memoryService.listMemories({
      tags: ['test'],
      limit: 10,
      user_id: TEST_USER_ID,
    });
    log(`  Found ${listed.total} test memories`, colors.reset);
    log('List memories working', colors.green);

    // Test 6: Query Memories (vector search)
    log('\n7. Testing Query Memories...', colors.yellow);
    try {
      const queryEmbedding = await embeddings.generateEmbedding('test memory');
      const queried = await memoryService.queryMemories({ query: 'test', user_id: TEST_USER_ID }, queryEmbedding);
      log(`  Found ${queried.length} similar memories`, colors.reset);
      log('Query memories working', colors.green);
    } catch (error) {
      log('  Query failed — the mongot vector search index may not exist yet.', colors.yellow);
      log('     Run: npm run setup:mongo-indexes', colors.yellow);
      log(`     (${error instanceof Error ? error.message : 'unknown error'})`, colors.yellow);
    }

    // Test 7: Reinforce Memory
    log('\n8. Testing Reinforce Memory...', colors.yellow);
    const reinforced = await memoryService.reinforceMemory(stored.id, TEST_USER_ID);
    if (reinforced.access_count < 1) {
      throw new Error('Access count not incremented');
    }
    log(`  Access count: ${reinforced.access_count}`, colors.reset);
    log('Reinforce memory working', colors.green);

    // Cleanup
    log('\n9. Cleanup...', colors.yellow);
    log('  Test memory will remain for inspection', colors.reset);
    log(`  To cleanup: db.memories.deleteMany({ tags: "test", user_id: "${TEST_USER_ID}" })`, colors.reset);

    log('\nAll tests passed!\n', colors.green);

    return true;
  } catch (error) {
    log(`\nTest failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`, colors.red);
    return false;
  }
}

// Run tests
runTests().then((success) => {
  process.exit(success ? 0 : 1);
});
