# KMS Wallet

Ethereum wallet library using AWS KMS for signing transactions.

## Features

- Transaction signing using AWS KMS
- personal_sign implementation
- Public key and address retrieval

## Installation

```bash
npm install
```

## Usage

### Basic Usage

```typescript
import { KmsWallet } from 'kms-wallet';

const wallet = new KmsWallet({
  keyId: 'YOUR_KMS_KEY_ID',
  region: 'us-east-1',
});

// Get Ethereum address
const address = await wallet.getAddress();

// Sign a message
const signature = await wallet.personalSign('Hello, Ethereum!');

// Sign a transaction
const signedTx = await wallet.signTransaction({
  to: '0x...',
  value: ethers.parseEther('0.001'),
  gasLimit: 21000,
  gasPrice: ethers.parseUnits('20', 'gwei'),
  nonce: 0,
  chainId: 1,
});
```

### Multi-User Wallets

For managing multiple users with individual KMS keys:

```typescript
import { KmsWallet } from 'kms-wallet';
import { KMSClient, CreateKeyCommand, KeySpec, KeyUsageType } from '@aws-sdk/client-kms';

class WalletManager {
  private kmsClient: KMSClient;

  async createUserWallet(userId: string) {
    // Create a new KMS key for the user
    const response = await this.kmsClient.send(new CreateKeyCommand({
      KeySpec: KeySpec.ECC_SECG_P256K1,
      KeyUsage: KeyUsageType.SIGN_VERIFY,
      Description: `Ethereum wallet for user ${userId}`,
    }));

    const keyId = response.KeyMetadata?.KeyId;
    const wallet = new KmsWallet({ keyId });
    return { keyId, wallet };
  }
}
```

### With AWS Amplify Gen2

See `example/` directory for complete usage examples:
- `index.ts` - Basic single-wallet example
- `multi-user.ts` - Multi-user wallet management

## KMS Key Setup

The KMS key must be configured with the following specifications:
- Key spec: `ECC_SECG_P256K1`
- Key usage: `SIGN_VERIFY`

You can create the key using AWS CLI:

```bash
aws kms create-key \
  --key-spec ECC_SECG_P256K1 \
  --key-usage SIGN_VERIFY \
  --description "Ethereum signing key" \
  --profile YOUR_PROFILE
```

Or use the Amplify Gen2 example which creates the key automatically.

## Build

```bash
npm run build
```

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the library: `npm run build`
4. Run Amplify sandbox: `cd example && npx ampx sandbox`
5. In another terminal, run the example: `cd example && npm run dev`

The example will automatically use the KMS key created by Amplify (no manual key configuration needed).
