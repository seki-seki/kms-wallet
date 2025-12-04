import { KmsWallet } from 'kms-wallet';
import { ethers } from 'ethers';
import { KMSClient, CreateKeyCommand, KeySpec, KeyUsageType } from '@aws-sdk/client-kms';

/**
 * Multi-user wallet manager
 * Demonstrates managing multiple KMS keys for different users
 *
 * This example works with Amplify Gen2 by using the same AWS credentials
 * that Amplify Sandbox provides. Make sure you have:
 * 1. Run `npx ampx sandbox` to set up AWS credentials
 * 2. IAM permissions to create KMS keys (kms:CreateKey, kms:TagResource)
 * 3. IAM permissions to use KMS keys (kms:GetPublicKey, kms:Sign)
 *
 * For production use, store user->keyId mappings in a database (e.g., DynamoDB)
 * and manage permissions through Amplify Auth.
 */
class MultiUserWalletManager {
  private kmsClient: KMSClient;
  private wallets: Map<string, { keyId: string; wallet: KmsWallet }>;

  constructor(region?: string) {
    // Uses the same AWS credentials as Amplify (from environment or AWS profile)
    this.kmsClient = new KMSClient({
      region: region || process.env.AWS_REGION || 'ap-northeast-1',
    });
    this.wallets = new Map();
  }

  /**
   * Create a new KMS key for a user
   */
  async createUserWallet(userId: string): Promise<{ keyId: string; address: string }> {
    console.log(`Creating KMS key for user: ${userId}...`);

    // Create a new KMS key
    const createKeyCommand = new CreateKeyCommand({
      KeySpec: KeySpec.ECC_SECG_P256K1,
      KeyUsage: KeyUsageType.SIGN_VERIFY,
      Description: `Ethereum wallet for user ${userId}`,
      Tags: [
        {
          TagKey: 'UserId',
          TagValue: userId,
        },
        {
          TagKey: 'Purpose',
          TagValue: 'Ethereum-Wallet',
        },
      ],
    });

    const response = await this.kmsClient.send(createKeyCommand);

    if (!response.KeyMetadata?.KeyId) {
      throw new Error('Failed to create KMS key');
    }

    const keyId = response.KeyMetadata.KeyId;
    console.log(`✓ Created KMS key: ${keyId}`);

    // Create wallet instance
    const wallet = new KmsWallet({
      keyId,
      kmsClient: this.kmsClient,
    });

    // Get Ethereum address
    const address = await wallet.getAddress();
    console.log(`✓ Ethereum address: ${address}`);

    // Store in cache
    this.wallets.set(userId, { keyId, wallet });

    return { keyId, address };
  }

  /**
   * Get wallet for a user (from cache or create new instance)
   */
  getWallet(userId: string, keyId: string): KmsWallet {
    const cached = this.wallets.get(userId);
    if (cached && cached.keyId === keyId) {
      return cached.wallet;
    }

    const wallet = new KmsWallet({
      keyId,
      kmsClient: this.kmsClient,
    });

    this.wallets.set(userId, { keyId, wallet });
    return wallet;
  }

  /**
   * Get all cached wallets
   */
  getCachedWallets(): Array<{ userId: string; keyId: string }> {
    return Array.from(this.wallets.entries()).map(([userId, { keyId }]) => ({
      userId,
      keyId,
    }));
  }
}

/**
 * Example: Managing multiple users with individual KMS keys
 */
async function multiUserExample() {
  console.log('=== Multi-User Wallet Example ===\n');

  const manager = new MultiUserWalletManager();

  // Create wallets for multiple users
  const users = ['alice', 'bob', 'charlie'];
  const userWallets: Array<{ userId: string; keyId: string; address: string }> = [];

  for (const userId of users) {
    const { keyId, address } = await manager.createUserWallet(userId);
    userWallets.push({ userId, keyId, address });
    console.log();
  }

  // Display summary
  console.log('=== User Wallets Summary ===');
  for (const { userId, keyId, address } of userWallets) {
    console.log(`User: ${userId}`);
    console.log(`  Key ID: ${keyId}`);
    console.log(`  Address: ${address}`);
    console.log();
  }

  // Example: Sign a message with Alice's wallet
  console.log('=== Signing with Alice\'s Wallet ===');
  const aliceWallet = manager.getWallet('alice', userWallets[0].keyId);
  const message = 'Hello from Alice!';
  const signature = await aliceWallet.personalSign(message);
  console.log('Message:', message);
  console.log('Signature:', signature);

  // Verify signature
  const recoveredAddress = ethers.verifyMessage(message, signature);
  console.log('Recovered Address:', recoveredAddress);
  console.log('Signature Valid:', recoveredAddress.toLowerCase() === userWallets[0].address.toLowerCase());
}

/**
 * Example: Using pre-existing KMS keys (e.g., from database)
 */
async function existingKeysExample() {
  console.log('\n=== Using Existing Keys Example ===\n');

  const manager = new MultiUserWalletManager();

  // Simulate loading user-key mappings from database
  const userKeyMappings = [
    { userId: 'user-1', keyId: 'your-kms-key-id-1' },
    { userId: 'user-2', keyId: 'your-kms-key-id-2' },
  ];

  console.log('Loading wallets from existing keys...');
  for (const { userId, keyId } of userKeyMappings) {
    const wallet = manager.getWallet(userId, keyId);
    const address = await wallet.getAddress();
    console.log(`User ${userId}: ${address}`);
  }
}

async function main() {
  try {
    // Example 1: Create new KMS keys for multiple users
    await multiUserExample();

    // Example 2: Use existing KMS keys (commented out by default)
    // await existingKeysExample();
  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  }
}

main();
