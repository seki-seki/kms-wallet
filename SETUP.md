# Setup Guide

## Prerequisites

- Node.js 18 or later
- AWS Account with appropriate permissions
- AWS CLI configured with credentials

## Quick Start

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install example dependencies
cd example
npm install
```

### 2. Create KMS Key and Run Example (Recommended)

The easiest way is to use Amplify Gen2, which automatically creates the KMS key:

```bash
cd example
npx ampx sandbox
```

This will:
- Create a KMS key with the correct specs (ECC_SECG_P256K1)
- Generate `amplify_outputs.json` with the KMS Key ID
- Set up all AWS resources

Then in another terminal, run the example:

```bash
cd example
npm run dev
```

The example will automatically read the KMS Key ID from `amplify_outputs.json` - no manual configuration needed!

### Alternative: Using AWS CLI

If you prefer to create the key manually:

```bash
aws kms create-key \
  --key-spec ECC_SECG_P256K1 \
  --key-usage SIGN_VERIFY \
  --description "Ethereum signing key"
```

Then set the KeyId as an environment variable:

```bash
export KMS_KEY_ID=<your-kms-key-id>
cd example
npm run dev
```

## Manual KMS Key Creation

If you prefer to create the key manually through the AWS Console:

1. Go to AWS KMS Console
2. Create Key
3. Select:
   - Key type: Asymmetric
   - Key usage: Sign and verify
   - Key spec: ECC_SECG_P256K1
4. Complete the key creation wizard
5. Note the Key ID for use in your application

## Testing Without AWS

For local testing without AWS credentials, you'll need to mock the KMS client. The library is designed to work with real AWS KMS only.

## Troubleshooting

### Error: AccessDeniedException

Make sure your AWS credentials have the following permissions:
- `kms:GetPublicKey`
- `kms:Sign`
- `kms:DescribeKey`

### Error: Invalid DER signature

This usually means the KMS key is not configured correctly. Make sure:
- Key spec is `ECC_SECG_P256K1` (not ECC_NIST_P256)
- Key usage is `SIGN_VERIFY`

### Error: Failed to find valid recovery parameter

This is usually a transient error. Try running the operation again.
