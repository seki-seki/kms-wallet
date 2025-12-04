# Multi-User Wallet Setup with Amplify Gen2

This guide explains how to set up the multi-user wallet example with Amplify Gen2.

## Architecture

The multi-user example demonstrates a production-ready pattern where:
1. Each user gets their own KMS key
2. User→KMS Key ID mappings are stored (in this example, in memory; in production, use DynamoDB)
3. The application dynamically creates and manages KMS keys

## Setup with Amplify Gen2

### Option 1: Using Custom Backend Configuration

1. Replace `amplify/backend.ts` with the multi-user configuration:
```bash
cp amplify/backend-multi.ts amplify/backend.ts
```

2. Start Amplify Sandbox:
```bash
npx ampx sandbox
```

This will create the necessary IAM permissions for creating KMS keys.

3. Run the multi-user example:
```bash
export AWS_PROFILE=your-aws-profile  # Optional
npm run dev:multi
```

### Option 2: Using IAM Policies

If you prefer to keep the basic backend configuration, you can add the necessary IAM permissions manually:

1. Create an IAM policy with these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:CreateKey",
        "kms:DescribeKey",
        "kms:GetPublicKey",
        "kms:Sign",
        "kms:TagResource"
      ],
      "Resource": "*"
    }
  ]
}
```

2. Attach the policy to your AWS user or role

3. Run the example with your AWS profile:
```bash
export AWS_PROFILE=your-aws-profile
npm run dev:multi
```

## Production Deployment

For production use, consider this architecture:

### 1. Backend Structure
```
amplify/
├── backend.ts              # Main backend config
├── data/
│   └── resource.ts        # DynamoDB table for user→keyId mappings
└── functions/
    ├── create-wallet/     # Lambda to create user wallets
    └── sign-transaction/  # Lambda to sign transactions
```

### 2. Database Schema (DynamoDB)
```typescript
{
  userId: string;          // Partition key
  kmsKeyId: string;        // KMS Key ID
  ethereumAddress: string; // Derived Ethereum address
  createdAt: string;       // ISO timestamp
}
```

### 3. API Endpoints
```typescript
POST /wallet/create      // Create wallet for authenticated user
POST /wallet/sign        // Sign transaction/message
GET  /wallet/address     // Get user's Ethereum address
```

### 4. Security Considerations

- **Authentication**: Use Amplify Auth to authenticate users
- **Authorization**: Ensure users can only access their own wallets
- **Key Management**:
  - Tag KMS keys with user IDs for auditing
  - Implement key rotation policies
  - Set up CloudWatch alarms for unusual KMS usage
- **Cost Optimization**:
  - Each KMS key costs ~$1/month
  - Each signature operation costs ~$0.03 per 10,000 requests
  - Consider pooling keys for low-value use cases

## Example Lambda Function

```typescript
import { KmsWallet } from 'kms-wallet';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export const handler = async (event: any) => {
  const userId = event.requestContext.authorizer.claims.sub;

  // Get user's KMS key from database
  const keyId = await getUserKeyId(userId);

  // Create wallet instance
  const wallet = new KmsWallet({ keyId });

  // Sign transaction
  const signedTx = await wallet.signTransaction(event.body.transaction);

  return { statusCode: 200, body: JSON.stringify({ signedTx }) };
};
```

## Cost Estimation

For 1000 users with moderate activity:
- KMS Keys: 1000 keys × $1/month = $1,000/month
- Signatures: 10,000 transactions × $0.03/10k = $0.03/month
- DynamoDB: ~$5/month (with on-demand pricing)

**Total: ~$1,005/month**

## Testing

Run the test suite to ensure everything is working:
```bash
export AWS_PROFILE=your-aws-profile
npm run dev:multi
```

This will create 3 test users (alice, bob, charlie) with individual KMS keys.

## Cleanup

To remove test KMS keys:
```bash
# List keys tagged with test users
aws kms list-keys

# Schedule key deletion (7-30 days)
aws kms schedule-key-deletion --key-id <key-id> --pending-window-in-days 7
```
