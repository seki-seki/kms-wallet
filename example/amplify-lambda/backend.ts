// amplify/backend.ts
// Lambda関数でウォレット管理を実装

import { defineBackend } from '@aws-amplify/backend';
import { defineFunction } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

// Lambda関数の定義
const createWallet = defineFunction({
  name: 'create-wallet',
  entry: './functions/create-wallet/handler.ts',
});

const signMessage = defineFunction({
  name: 'sign-message',
  entry: './functions/sign-message/handler.ts',
});

const signTransaction = defineFunction({
  name: 'sign-transaction',
  entry: './functions/sign-transaction/handler.ts',
});

const backend = defineBackend({
  createWallet,
  signMessage,
  signTransaction,
});

// KMS権限をLambda関数に付与
const kmsPolicy = new PolicyStatement({
  actions: [
    'kms:CreateKey',
    'kms:GetPublicKey',
    'kms:Sign',
    'kms:DescribeKey',
    'kms:TagResource',
  ],
  resources: ['*'], // 本番環境では特定のARNまたはタグで制限
  conditions: {
    StringEquals: {
      'kms:ResourceTag/Purpose': 'Ethereum-Wallet',
    },
  },
});

// 各Lambda関数に権限を付与
createWallet.resources.lambda.addToRolePolicy(kmsPolicy);
signMessage.resources.lambda.addToRolePolicy(kmsPolicy);
signTransaction.resources.lambda.addToRolePolicy(kmsPolicy);

// 環境変数を設定（必要に応じて）
createWallet.addEnvironment('AWS_REGION', backend.stack.region);
signMessage.addEnvironment('AWS_REGION', backend.stack.region);
signTransaction.addEnvironment('AWS_REGION', backend.stack.region);

// Function URLsを有効化（Next.jsから直接呼び出す場合）
const createWalletUrl = createWallet.resources.lambda.addFunctionUrl({
  authType: 'AWS_IAM', // または 'NONE'（開発時のみ）
  cors: {
    allowedOrigins: ['*'], // 本番環境では制限する
    allowedMethods: ['POST'],
  },
});

const signMessageUrl = signMessage.resources.lambda.addFunctionUrl({
  authType: 'AWS_IAM',
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: ['POST'],
  },
});

const signTransactionUrl = signTransaction.resources.lambda.addFunctionUrl({
  authType: 'AWS_IAM',
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: ['POST'],
  },
});

// URLを出力
backend.addOutput({
  custom: {
    createWalletUrl: createWalletUrl.url,
    signMessageUrl: signMessageUrl.url,
    signTransactionUrl: signTransactionUrl.url,
  },
});
