// pages/api/wallet/[userId].ts
// Next.js Pages Router用のAPI Route実装

import type { NextApiRequest, NextApiResponse } from 'next';
import { KmsWallet } from 'kms-wallet';

async function getUserKeyId(userId: string): Promise<string | null> {
  // 本番環境: DBから取得
  // const user = await prisma.user.findUnique({
  //   where: { id: userId },
  //   select: { kmsKeyId: true }
  // });
  // return user?.kmsKeyId || null;

  // 開発時: 環境変数から取得
  return process.env[`KMS_KEY_${userId.toUpperCase()}`] || null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { userId } = req.query;

  if (typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const keyId = await getUserKeyId(userId);

  if (!keyId) {
    return res.status(404).json({ error: 'User wallet not found' });
  }

  const wallet = new KmsWallet({ keyId });

  try {
    switch (req.method) {
      case 'GET': {
        const address = await wallet.getAddress();
        const publicKey = await wallet.getPublicKey();

        return res.status(200).json({
          address,
          publicKey: Buffer.from(publicKey).toString('hex'),
        });
      }

      case 'POST': {
        const { message, transaction } = req.body;

        if (message) {
          const signature = await wallet.personalSign(message);
          return res.status(200).json({ signature });
        }

        if (transaction) {
          const signedTx = await wallet.signTransaction(transaction);
          return res.status(200).json({ signedTx });
        }

        return res.status(400).json({
          error: 'Either message or transaction is required',
        });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Vercel/Netlify用のタイムアウト設定
export const config = {
  maxDuration: 30,
};
