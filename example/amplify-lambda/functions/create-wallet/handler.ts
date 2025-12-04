// amplify/functions/create-wallet/handler.ts
import type { Handler } from 'aws-lambda';
import { KmsWallet } from 'kms-wallet';

interface CreateWalletEvent {
  userId: string;
  description?: string;
}

interface CreateWalletResponse {
  success: boolean;
  userId: string;
  keyId: string;
  keyArn: string;
  address: string;
  publicKey: string;
  error?: string;
}

export const handler: Handler<CreateWalletEvent, CreateWalletResponse> = async (event) => {
  console.log('Creating wallet for user:', event.userId);

  try {
    // KmsWallet.create()でウォレットを作成
    const { wallet, keyId, keyArn, address, publicKey } = await KmsWallet.create({
      description: event.description || `Ethereum wallet for user ${event.userId}`,
      tags: {
        UserId: event.userId,
        Purpose: 'Ethereum-Wallet',
        Environment: process.env.NODE_ENV || 'production',
      },
    });

    console.log('✓ Wallet created:', { keyId, address });

    // TODO: DBに保存
    // await dynamodb.put({
    //   TableName: process.env.WALLETS_TABLE,
    //   Item: { userId: event.userId, keyId, address }
    // });

    return {
      success: true,
      userId: event.userId,
      keyId,
      keyArn,
      address,
      publicKey,
    };
  } catch (error) {
    console.error('Error creating wallet:', error);

    return {
      success: false,
      userId: event.userId,
      keyId: '',
      keyArn: '',
      address: '',
      publicKey: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
