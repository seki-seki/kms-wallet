# KMS Wallet

Ethereum wallet library using AWS KMS for signing transactions. Compatible with ethers.js v6.

## Features

- 🔐 Transaction signing using AWS KMS
- ✍️ Message signing (personal_sign)
- 🔑 Public key and address retrieval from KMS
- 🎯 ethers.js Signer interface compatible
- 🚀 One-line wallet creation with KMS key generation
- 💰 **HD Wallet (Hierarchical Deterministic)** - Generate unlimited addresses from one KMS key
- 📦 TypeScript support

## Installation

```bash
npm install kms-wallet ethers @aws-sdk/client-kms
```

## Usage

### Using KmsSigner (Recommended)

`KmsSigner` implements the ethers.js `Signer` interface, making it a drop-in replacement for `ethers.Wallet`.

```typescript
import { ethers } from 'ethers';
import { KmsWallet, KmsSigner, KmsHdWallet } from 'kms-wallet';

// Setup
const kmsWallet = new KmsWallet({
  keyId: 'YOUR_KMS_KEY_ID',
  region: 'us-east-1', // optional
});

const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_KEY');
const signer = new KmsSigner({ kmsWallet, provider });

// Get address
const address = await signer.getAddress();
console.log(`Address: ${address}`);

// Send transaction (automatically signs with KMS and broadcasts)
const tx = await signer.sendTransaction({
  to: '0x...',
  value: ethers.parseEther('0.1'),
});
await tx.wait();

// Sign message
const signature = await signer.signMessage('Hello, Ethereum!');

// Connect to different provider
const newSigner = signer.connect(anotherProvider);
```

### Using KmsWallet (Low-level)

For more control or when you only need signing without broadcasting:

```typescript
import { KmsWallet } from 'kms-wallet';
import { ethers } from 'ethers';

const wallet = new KmsWallet({
  keyId: 'YOUR_KMS_KEY_ID',
  region: 'us-east-1',
});

// Get Ethereum address
const address = await wallet.getAddress();

// Sign a message
const signature = await wallet.personalSign('Hello, Ethereum!');

// Sign a transaction (returns signed transaction hex)
const signedTx = await wallet.signTransaction({
  to: '0x...',
  value: ethers.parseEther('0.001'),
  gasLimit: 21000,
  gasPrice: ethers.parseUnits('20', 'gwei'),
  nonce: 0,
  chainId: 1,
});

// Manually broadcast
const provider = new ethers.JsonRpcProvider('https://...');
await provider.broadcastTransaction(signedTx);
```

### Creating Wallets

Create a new KMS key and get the Ethereum address in one line:

```typescript
import { KmsWallet } from 'kms-wallet';

// Create a new wallet (KMS key + address)
const { wallet, keyId, address, publicKey } = await KmsWallet.create({
  description: 'Wallet for user alice',
  tags: {
    UserId: 'alice',
    Environment: 'production'
  }
});

console.log(`Created wallet with address: ${address}`);
console.log(`KMS Key ID: ${keyId}`);

// Use immediately
const signature = await wallet.personalSign('Hello!');
```

### HD Wallet (Cost Optimization)

**KmsHdWallet** uses BIP32/BIP44 hierarchical deterministic wallet standard to generate unlimited addresses from a single KMS key. This dramatically reduces costs from **$1/user/month** to **$1/month total**.

#### How it works

1. One KMS key generates a deterministic seed (via KMS signature)
2. The seed creates a BIP32 master node with BIP39 mnemonic
3. Child wallets are derived using standard path: `m/44'/60'/0'/0/{index}`
4. Each index (0, 1, 2, ...) produces a unique, deterministic address

#### Basic Usage

```typescript
import { KmsHdWallet } from 'kms-wallet';
import { ethers } from 'ethers';

// Create master HD wallet (one-time setup)
const { wallet, keyId, firstAddress } = await KmsHdWallet.create({
  description: 'Master HD Wallet for all users',
  tags: { Application: 'MyApp' }
});

console.log(`Master KMS Key: ${keyId}`);
console.log(`First address (index 0): ${firstAddress}`);

// Derive addresses for different users
const aliceAddress = await wallet.getAddress(0);  // User 0
const bobAddress = await wallet.getAddress(1);    // User 1
const carolAddress = await wallet.getAddress(2);  // User 2

// Get multiple addresses at once
const addresses = await wallet.getAddresses(10);  // Derive 10 addresses
console.log('10 user addresses:', addresses);

// Sign transaction for specific user
const provider = new ethers.JsonRpcProvider('https://...');
const aliceSigner = await wallet.getSigner(0, provider);
const tx = await aliceSigner.sendTransaction({
  to: '0x...',
  value: ethers.parseEther('0.1')
});

// Sign message for specific user
const bobSignature = await wallet.signMessage(1, 'Hello from Bob');
```

#### Multi-User Wallet Manager with HD Wallet

```typescript
class HdWalletManager {
  private hdWallet: KmsHdWallet;

  async initialize() {
    // Load existing HD wallet or create new one
    const kmsKeyId = await this.getOrCreateMasterKeyId();
    this.hdWallet = new KmsHdWallet({ keyId: kmsKeyId });
  }

  async createUserWallet(userId: string) {
    // Get next available index from database
    const index = await db.userWallet.count();

    // Derive address for this user
    const address = await this.hdWallet.getAddress(index);

    // Save to database
    await db.userWallet.create({
      data: { userId, walletIndex: index, ethereumAddress: address }
    });

    return { address, index };
  }

  async getUserSigner(userId: string, provider: ethers.Provider) {
    const record = await db.userWallet.findUnique({ where: { userId } });
    return this.hdWallet.getSigner(record.walletIndex, provider);
  }

  async signForUser(userId: string, message: string) {
    const record = await db.userWallet.findUnique({ where: { userId } });
    return this.hdWallet.signMessage(record.walletIndex, message);
  }
}
```

#### Cost Comparison

**Traditional KmsWallet (one key per user)**
- 100 users = 100 KMS keys = $100/month
- Each user has independent KMS key

**KmsHdWallet (one key for all users)**
- 100 users = 1 KMS key = $1/month
- All users share one master key, unique derived addresses

```typescript
// Cost savings example
const { wallet } = await KmsHdWallet.create({
  description: 'Master HD Wallet'
});

// Generate 100 user addresses from single KMS key
const addresses = await wallet.getAddresses(100);

console.log('100 users managed with 1 KMS key');
console.log('Monthly cost: $1 (vs $100 with separate keys)');
console.log('Annual savings: $1,188');
```

#### Using Existing KMS Key

```typescript
// If you already have a KMS key
const wallet = new KmsHdWallet({
  keyId: 'existing-kms-key-id',
  region: 'us-east-1',
  basePath: "m/44'/60'/0'/0"  // optional, Ethereum default
});

const address = await wallet.getAddress(0);
```

### Multi-User Wallet Management

```typescript
class WalletManager {
  async createUserWallet(userId: string) {
    // One-liner to create KMS key + get address
    const { wallet, keyId, address } = await KmsWallet.create({
      description: `Ethereum wallet for user ${userId}`,
      tags: {
        UserId: userId,
        Application: 'MyApp'
      }
    });

    // Save to database
    await db.userWallet.create({
      data: {
        userId,
        kmsKeyId: keyId,
        ethereumAddress: address
      }
    });

    return wallet;
  }

  async getUserWallet(userId: string) {
    const record = await db.userWallet.findUnique({ where: { userId } });

    return new KmsWallet({
      keyId: record.kmsKeyId,
      region: 'us-east-1'
    });
  }
}
```

### Sequential Transactions

KmsSigner automatically manages nonces for sequential transactions:

```typescript
const signer = new KmsSigner({ kmsWallet, provider });

// Send multiple transactions in sequence
for (let i = 0; i < 3; i++) {
  const tx = await signer.sendTransaction({
    to: recipient,
    value: ethers.parseEther('0.1'),
  });
  await tx.wait();
  console.log(`Transaction ${i + 1} confirmed: ${tx.hash}`);
}
```

## KMS Key Setup

The KMS key must be configured with the following specifications:
- **Key spec**: `ECC_SECG_P256K1` (secp256k1 curve for Ethereum)
- **Key usage**: `SIGN_VERIFY`

### Create via AWS CLI

```bash
aws kms create-key \
  --key-spec ECC_SECG_P256K1 \
  --key-usage SIGN_VERIFY \
  --description "Ethereum signing key" \
  --region us-east-1
```

### Create programmatically

```typescript
const { keyId } = await KmsWallet.create({
  description: 'My Ethereum Wallet',
  region: 'us-east-1'
});
```

## API Reference

### KmsWallet

#### Constructor
```typescript
new KmsWallet(config: KmsWalletConfig)
```

#### Methods
- `getAddress(): Promise<string>` - Get Ethereum address
- `getPublicKey(): Promise<Uint8Array>` - Get uncompressed public key
- `personalSign(message: string | Uint8Array): Promise<string>` - Sign message
- `signTransaction(tx: TransactionRequest): Promise<string>` - Sign transaction
- `static create(config: CreateKmsWalletConfig): Promise<CreateKmsWalletResult>` - Create new KMS key and wallet

### KmsSigner

#### Constructor
```typescript
new KmsSigner(config: KmsSignerConfig)
```

#### Methods (ethers.js Signer interface)
- `getAddress(): Promise<string>` - Get signer address
- `signTransaction(tx: TransactionRequest): Promise<string>` - Sign transaction
- `signMessage(message: string | Uint8Array): Promise<string>` - Sign message
- `sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>` - Sign and send transaction
- `connect(provider: Provider): KmsSigner` - Connect to different provider

### KmsHdWallet

HD Wallet (Hierarchical Deterministic) that generates unlimited addresses from one KMS key using BIP32/BIP44 standard.

#### Constructor
```typescript
new KmsHdWallet(config: KmsHdWalletConfig)
```

**Config Options:**
- `keyId: string` - KMS Key ID for seed generation
- `region?: string` - AWS region (optional)
- `basePath?: string` - Base derivation path (optional, defaults to `m/44'/60'/0'/0`)

#### Methods
- `getAddress(index: number): Promise<string>` - Get Ethereum address at index
- `getAddresses(count: number, startIndex?: number): Promise<string[]>` - Derive multiple addresses
- `getPrivateKey(index: number): Promise<string>` - Get private key at index (use with caution)
- `getPublicKey(index: number): Promise<string>` - Get public key at index
- `signMessage(index: number, message: string | Uint8Array): Promise<string>` - Sign message with specific account
- `signTransaction(index: number, tx: TransactionRequest): Promise<string>` - Sign transaction with specific account
- `getWallet(index: number, provider?: Provider): Promise<Wallet>` - Get ethers.js Wallet for account
- `getSigner(index: number, provider: Provider): Promise<Wallet>` - Get ethers.js Signer for account (alias)
- `getKeyId(): string` - Get KMS Key ID
- `getBasePath(): string` - Get base derivation path
- `static create(config: CreateKmsHdWalletConfig): Promise<CreateKmsHdWalletResult>` - Create new master KMS key and HD wallet

**CreateKmsHdWalletResult:**
```typescript
{
  wallet: KmsHdWallet;
  keyId: string;
  firstAddress: string;  // Address at index 0
  basePath: string;
}
```

## Examples

See `example/` directory for complete working examples:
- Single wallet usage
- Multi-user wallet management
- AWS Amplify Gen2 integration

## Testing

```bash
# Install dependencies
npm install

# Run tests (requires AWS credentials)
AWS_PROFILE=your-profile npm test
```

Tests automatically create and clean up KMS keys.

## Requirements

- Node.js 18+
- AWS credentials with KMS permissions
- ethers.js v6

## AWS Permissions

Required IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:CreateKey",
        "kms:GetPublicKey",
        "kms:Sign",
        "kms:DescribeKey",
        "kms:TagResource"
      ],
      "Resource": "*"
    }
  ]
}
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
