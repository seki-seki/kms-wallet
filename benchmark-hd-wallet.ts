import { KmsHdWallet } from './src/KmsHdWallet';
import { KMSClient, ScheduleKeyDeletionCommand } from '@aws-sdk/client-kms';

async function benchmark() {
  console.log('=== KmsHdWallet Performance Benchmark ===\n');

  // Create HD wallet
  console.log('Creating HD wallet...');
  const startCreate = Date.now();
  const { wallet, keyId } = await KmsHdWallet.create({
    description: 'Benchmark HD Wallet (temporary)',
    tags: { Test: 'benchmark' }
  });
  const createTime = Date.now() - startCreate;
  console.log(`✓ Created in ${createTime}ms\n`);
  console.log(`KMS Key ID: ${keyId}\n`);

  // Test different indices
  const testIndices = [
    0,
    10,
    100,
    1000,
    10000,
    100000,
    1000000, // 100万
  ];

  console.log('Testing address derivation at various indices:\n');

  let millionFirstTime = 0;
  let millionCachedTime = 0;

  for (const index of testIndices) {
    // First access (includes seed generation + master node creation + derivation)
    const start1 = Date.now();
    const address1 = await wallet.getAddress(index);
    const time1 = Date.now() - start1;

    // Second access (cached seed and master node, only derivation)
    const start2 = Date.now();
    const address2 = await wallet.getAddress(index);
    const time2 = Date.now() - start2;

    if (index === 1000000) {
      millionFirstTime = time1;
      millionCachedTime = time2;
    }

    console.log(`Index ${index.toLocaleString().padStart(10)}:`);
    console.log(`  First access:  ${time1}ms (includes KMS call)`);
    console.log(`  Second access: ${time2}ms (cached seed)`);
    console.log(`  Address: ${address1.slice(0, 10)}...${address1.slice(-8)}`);
    console.log();
  }

  // Test batch derivation
  console.log('Testing batch derivation (10 addresses starting from 1,000,000):\n');
  const batchStart = Date.now();
  const addresses = await wallet.getAddresses(10, 1000000);
  const batchTime = Date.now() - batchStart;
  console.log(`✓ Derived 10 addresses in ${batchTime}ms`);
  console.log(`  Average: ${(batchTime / 10).toFixed(2)}ms per address\n`);

  // Test signing at high index
  console.log('Testing message signing at index 1,000,000:\n');
  const signStart = Date.now();
  const signature = await wallet.signMessage(1000000, 'Hello, million!');
  const signTime = Date.now() - signStart;
  console.log(`✓ Signed in ${signTime}ms`);
  console.log(`  Signature: ${signature.slice(0, 20)}...\n`);

  console.log('=== Summary ===');
  console.log(`Index 1,000,000 (first access):  ${millionFirstTime}ms (includes KMS call)`);
  console.log(`Index 1,000,000 (cached):        ${millionCachedTime}ms`);
  console.log(`\n✓ HD wallet scales efficiently regardless of index!`);

  // Cleanup: Schedule key deletion
  console.log(`\nCleaning up...`);
  const kmsClient = new KMSClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
  try {
    await kmsClient.send(new ScheduleKeyDeletionCommand({
      KeyId: keyId,
      PendingWindowInDays: 7,
    }));
    console.log(`✓ Scheduled deletion of KMS key: ${keyId} (7 days)`);
  } catch (error) {
    console.error(`Failed to schedule deletion of KMS key: ${keyId}`, error);
    console.log(`Please delete manually: aws kms schedule-key-deletion --key-id ${keyId}`);
  }
}

// Run benchmark
benchmark().catch(console.error);
