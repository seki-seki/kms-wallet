// app/api/wallet/[userId]/route.ts
// Next.js App Router用のAPI Route実装

import { NextRequest, NextResponse } from 'next/server';
import { KmsWallet } from 'kms-wallet';

// ユーザーIDからKMS Key IDを取得
// 本番環境ではDynamoDB/PrismaなどのDBから取得してください
async function getUserKeyId(userId: string): Promise<string | null> {
  // 例: DynamoDBから取得
  // const result = await dynamodb.get({
  //   TableName: 'UserWallets',
  //   Key: { userId }
  // });
  // return result.Item?.kmsKeyId;

  // 開発時: 環境変数から取得
  const keyId = process.env[`KMS_KEY_${userId.toUpperCase()}`];
  return keyId || null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const keyId = await getUserKeyId(params.userId);

    if (!keyId) {
      return NextResponse.json(
        { error: 'User wallet not found' },
        { status: 404 }
      );
    }

    const wallet = new KmsWallet({ keyId });
    const address = await wallet.getAddress();
    const publicKey = await wallet.getPublicKey();

    return NextResponse.json({
      address,
      publicKey: Buffer.from(publicKey).toString('hex'),
    });
  } catch (error) {
    console.error('Error getting wallet:', error);
    return NextResponse.json(
      { error: 'Failed to get wallet information' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const body = await request.json();
    const { message, transaction } = body;

    const keyId = await getUserKeyId(params.userId);

    if (!keyId) {
      return NextResponse.json(
        { error: 'User wallet not found' },
        { status: 404 }
      );
    }

    const wallet = new KmsWallet({ keyId });

    // personal_sign
    if (message) {
      const signature = await wallet.personalSign(message);
      return NextResponse.json({ signature });
    }

    // トランザクション署名
    if (transaction) {
      const signedTx = await wallet.signTransaction(transaction);
      return NextResponse.json({ signedTx });
    }

    return NextResponse.json(
      { error: 'Either message or transaction is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error signing:', error);
    return NextResponse.json(
      { error: 'Failed to sign' },
      { status: 500 }
    );
  }
}

// タイムアウトを30秒に設定（KMS呼び出しに時間がかかる場合がある）
export const maxDuration = 30;
