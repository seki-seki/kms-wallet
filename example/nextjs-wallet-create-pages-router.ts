// pages/api/wallet/create.ts
// ユーザーのウォレット（KMSキー）を作成するAPI

import type { NextApiRequest, NextApiResponse } from 'next';
import { KmsWallet } from 'kms-wallet';

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

    console.log(`Creating wallet for user: ${userId}`);

    // KmsWallet.create()で一発作成
    const { wallet, keyId, address, publicKey } = await KmsWallet.create({
      description: `Ethereum wallet for user ${userId}`,
      tags: {
        UserId: userId,
        Purpose: 'Ethereum-Wallet',
        Environment: process.env.NODE_ENV || 'development',
      },
    });

    console.log(`✓ Created wallet with key: ${keyId}`);
    console.log(`✓ Ethereum address: ${address}`);

    // データベースに保存
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
