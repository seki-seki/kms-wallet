// app/api/wallet/create/route.ts
// ユーザーのウォレット（KMSキー）を作成するAPI

import { NextRequest, NextResponse } from 'next/server';
import { KmsWallet } from 'kms-wallet';

// データベース保存の例（実装は環境に合わせて変更）
async function saveUserWallet(userId: string, kmsKeyId: string, address: string) {
  // Prismaの例:
  // await prisma.userWallet.create({
  //   data: { userId, kmsKeyId, ethereumAddress: address }
  // });

  // DynamoDBの例:
  // await dynamodb.put({
  //   TableName: 'UserWallets',
  //   Item: { userId, kmsKeyId, ethereumAddress: address, createdAt: Date.now() }
  // });

  console.log('Saving to DB:', { userId, kmsKeyId, address });
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
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
    return NextResponse.json({
      success: true,
      userId,
      keyId,
      address,
      publicKey: Buffer.from(publicKey).toString('hex'),
      message: 'Wallet created successfully',
    });

  } catch (error) {
    console.error('Error creating wallet:', error);

    return NextResponse.json(
      {
        error: 'Failed to create wallet',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// タイムアウトを60秒に設定（KMS操作は時間がかかる場合がある）
export const maxDuration = 60;
