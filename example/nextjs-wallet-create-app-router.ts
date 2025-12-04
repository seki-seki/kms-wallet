// app/api/wallet/create/route.ts
// ユーザーのウォレット（KMSキー）を作成するAPI

import { NextRequest, NextResponse } from 'next/server';
import { KmsWallet } from 'kms-wallet';
import { KMSClient, CreateKeyCommand, KeySpec, KeyUsageType } from '@aws-sdk/client-kms';

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
