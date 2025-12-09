# KMS Wallet

Ethereum wallet library using AWS KMS for signing transactions. Compatible with ethers.js v6.

## Features

- 🔐 Transaction signing using AWS KMS
- ✍️ Message signing (personal_sign)
- 🔑 Public key and address retrieval from KMS
- 🎯 ethers.js Signer interface compatible
- 🚀 One-line wallet creation with KMS key generation
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
import { KmsWallet, KmsSigner } from 'kms-wallet';

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
