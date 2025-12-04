// pages/api/wallet/create.ts
// ユーザーのウォレット（KMSキー）を作成するAPI

import type { NextApiRequest, NextApiResponse } from 'next';
import { KmsWallet } from 'kms-wallet';
import { KMSClient, CreateKeyCommand, KeySpec, KeyUsageType } from '@aws-sdk/client-kms';

async function saveUserWallet(userId: string, kmsKeyId: string, address: string) {
  // TODO: 実際のDB保存処理を実装
  // Prisma:
  // await prisma.userWallet.create({
  //   data: { userId, kmsKeyId, ethereumAddress: address }
  // });

  console.log('Saving to DB:', { userId, kmsKeyId, address });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // 1. KMSクライアントを初期化
    const kmsClient = new KMSClient({
      region: process.env.AWS_REGION || 'ap-northeast-1',
    });

    // 2. KMSキーを作成
    console.log(`Creating KMS key for user: ${userId}`);
    const createKeyCommand = new CreateKeyCommand({
      KeySpec: KeySpec.ECC_SECG_P256K1,
      KeyUsage: KeyUsageType.SIGN_VERIFY,
      Description: `Ethereum wallet for user ${userId}`,
      Tags: [
        { TagKey: 'UserId', TagValue: userId },
        { TagKey: 'Purpose', TagValue: 'Ethereum-Wallet' },
        { TagKey: 'Environment', TagValue: process.env.NODE_ENV || 'development' },
      ],
    });

    const response = await kmsClient.send(createKeyCommand);

    if (!response.KeyMetadata?.KeyId) {
      throw new Error('Failed to create KMS key');
    }

    const keyId = response.KeyMetadata.KeyId;
    console.log(`✓ Created KMS key: ${keyId}`);

    // 3. Ethereumアドレスを取得（初回のみKMSを呼び出す）
    const wallet = new KmsWallet({ keyId, kmsClient });
    const address = await wallet.getAddress();
    const publicKey = await wallet.getPublicKey();

    console.log(`✓ Ethereum address: ${address}`);

    // 4. データベースに保存
    await saveUserWallet(userId, keyId, address);

    // 5. 結果を返す
    return res.status(200).json({
      success: true,
      userId,
      keyId,
      address,
      publicKey: Buffer.from(publicKey).toString('hex'),
      message: 'Wallet created successfully',
    });

  } catch (error) {
    console.error('Error creating wallet:', error);

    return res.status(500).json({
      error: 'Failed to create wallet',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Vercel/Netlify用のタイムアウト設定
export const config = {
  maxDuration: 60,
};
