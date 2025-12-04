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

## What the example does

The example demonstrates all main features of the kms-wallet library:

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
