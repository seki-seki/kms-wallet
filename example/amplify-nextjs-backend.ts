// amplify/backend.ts
// Amplify HostingでNext.jsをデプロイする場合の設定例

import { defineBackend } from '@aws-amplify/backend';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';

const backend = defineBackend({});

// KMS権限のポリシー
const kmsPolicy = new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    'kms:GetPublicKey',
    'kms:Sign',
    'kms:DescribeKey',
  ],
  // 本番環境では特定のKey ARNに制限してください
  resources: ['*'],
  conditions: {
    StringEquals: {
      // タグでフィルタリング（推奨）
      'kms:ResourceTag/Purpose': 'Ethereum-Wallet',
    },
  },
});

// Amplify Hostingのサービスロールを取得してポリシーを追加
// Note: Amplifyコンソールで作成されたロールのARNを指定する必要があります
// または、カスタムロールを作成してAmplifyに適用します

// カスタムロールの例
const nextjsExecutionRole = new iam.Role(backend.stack, 'NextJsExecutionRole', {
  assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
  description: 'Execution role for Next.js SSR with KMS permissions',
});

nextjsExecutionRole.addToPolicy(kmsPolicy);

// ロールARNをSSMパラメータストアに保存（後でAmplifyコンソールで使用）
new ssm.StringParameter(backend.stack, 'NextJsRoleArn', {
  parameterName: '/amplify/nextjs/execution-role-arn',
  stringValue: nextjsExecutionRole.roleArn,
  description: 'Next.js execution role ARN with KMS permissions',
});

// 出力
backend.addOutput({
  custom: {
    nextjsExecutionRoleArn: nextjsExecutionRole.roleArn,
    instructions: 'Use this role ARN in Amplify Hosting settings',
  },
});

// 使用方法:
// 1. npx ampx sandbox でデプロイ
// 2. 出力されたロールARNをコピー
// 3. Amplify Console > App settings > Environment variables で設定
//    または、Build settings で Service role として設定
