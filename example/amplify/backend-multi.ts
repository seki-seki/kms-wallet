import { defineBackend } from '@aws-amplify/backend';

/**
 * Multi-user backend configuration
 *
 * This configuration is for reference only.
 * For the multi-user example to work, you need to ensure your AWS credentials
 * have the following IAM permissions:
 *
 * - kms:CreateKey
 * - kms:DescribeKey
 * - kms:GetPublicKey
 * - kms:Sign
 * - kms:TagResource
 *
 * You can add these permissions to your AWS user/role via IAM policy.
 *
 * For production use with Amplify Auth, you would:
 * 1. Define auth resources using defineAuth()
 * 2. Add KMS permissions to the authenticated user role
 * 3. Use Lambda functions to create/manage wallets with proper access control
 */

const backend = defineBackend({});

// Export basic configuration
backend.addOutput({
  custom: {
    region: backend.stack.region,
    note: 'Multi-user example requires additional IAM permissions for KMS operations',
  },
});
