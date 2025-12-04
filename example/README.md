# KMS Wallet Example

This example demonstrates how to use the kms-wallet library with AWS Amplify Gen2.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start Amplify sandbox (creates KMS key automatically):
```bash
npx ampx sandbox
```

This will:
- Create a KMS key with the correct specs (ECC_SECG_P256K1)
- Generate `amplify_outputs.json` with the KMS Key ID
- Set up all AWS resources

3. Set AWS profile (if needed) and run the example:
```bash
# Optional: set AWS profile if not using default
export AWS_PROFILE=your-aws-profile
npm run dev
```

The example will automatically:
- Read the KMS Key ID from `amplify_outputs.json`
- Use the AWS profile for authentication

## Alternative: Use existing KMS key

If you already have a KMS key, you can skip the Amplify sandbox and set the key ID directly:

```bash
export KMS_KEY_ID=your-existing-key-id
npm run dev
```

## Examples

### 1. Basic Example (`index.ts`)

Single wallet demonstration using Amplify-generated KMS key.

### 2. Multi-User Example (`multi-user.ts`)

Demonstrates managing multiple users with individual KMS keys:
- Creating KMS keys for each user dynamically
- Managing multiple wallets with a `MultiUserWalletManager` class
- User-to-wallet mapping (suitable for production use cases)

**Prerequisites:**
This example requires additional IAM permissions to create KMS keys. You need:
1. `kms:CreateKey` permission
2. `kms:TagResource` permission
3. `kms:GetPublicKey` and `kms:Sign` permissions

**Setup:**
```bash
# Option 1: Using Amplify Sandbox (uses your AWS credentials)
npx ampx sandbox

# Option 2: Set AWS profile with necessary permissions
export AWS_PROFILE=your-profile-with-kms-permissions

# Run the example
npm run dev:multi
```

**Note:** This example creates actual KMS keys in your AWS account (~$1/month per key). Make sure you have the necessary permissions and understand the costs involved.

**Production Considerations:**
- Store user→keyId mappings in a database (DynamoDB, etc.)
- Implement proper access control using Amplify Auth
- Consider key rotation and backup strategies

## What the examples demonstrate

The examples demonstrate all main features of the kms-wallet library:

1. **Get Public Key**: Retrieves the public key from KMS
2. **Get Address**: Derives the Ethereum address from the public key
3. **Personal Sign**: Signs a message using `personal_sign`
4. **Sign Transaction**: Signs an Ethereum transaction

## AWS Amplify Gen2 Integration

The example uses Amplify Gen2 to:
- Create a KMS key with the correct specifications for Ethereum signing (ECC_SECG_P256K1)
- Manage AWS resources declaratively
- Output the KMS key ID for use in the application

## Notes

- The KMS key is configured with `ECC_SECG_P256K1` key spec, which is compatible with Ethereum's secp256k1 curve
- Make sure your AWS credentials have permission to create KMS keys and use them for signing
- The example uses the KMS key ID from environment variables or Amplify outputs
