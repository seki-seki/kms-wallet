import { defineBackend } from '@aws-amplify/backend';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';

const backend = defineBackend({});

// Create KMS key for Ethereum signing
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

// If you're using Lambda functions, grant them permission to use the KMS key
// Example:
// kmsKey.grantSign(myFunction);
