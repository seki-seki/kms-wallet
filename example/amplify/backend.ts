import { defineBackend } from '@aws-amplify/backend';
import * as kms from 'aws-cdk-lib/aws-kms';

const backend = defineBackend({});

// Create a single KMS key for basic example (index.ts)
const kmsKey = new kms.Key(backend.stack, 'EthereumSigningKey', {
  description: 'KMS key for Ethereum transaction signing',
  keySpec: kms.KeySpec.ECC_SECG_P256K1,
  keyUsage: kms.KeyUsage.SIGN_VERIFY,
});

// Export the key ID for use in the application
backend.addOutput({
  custom: {
    kmsKeyId: kmsKey.keyId,
    kmsKeyArn: kmsKey.keyArn,
  },
});

// Note: For multi-user scenarios (multi-user.ts), you'll need:
// 1. IAM permissions to create KMS keys dynamically
// 2. A database (like DynamoDB) to store user -> keyId mappings
// See backend-multi.ts for an example configuration
