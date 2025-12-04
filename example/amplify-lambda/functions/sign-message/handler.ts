// amplify/functions/sign-message/handler.ts
import type { Handler } from 'aws-lambda';
import { KmsWallet } from 'kms-wallet';

interface SignMessageEvent {
  userId: string;
  message: string;
}

interface SignMessageResponse {
  success: boolean;
  signature?: string;
  error?: string;
}

export const handler: Handler<SignMessageEvent, SignMessageResponse> = async (event) => {
  console.log('Signing message for user:', event.userId);

  try {
    // TODO: DBからkeyIdを取得
    // const user = await dynamodb.get({
    //   TableName: process.env.WALLETS_TABLE,
    //   Key: { userId: event.userId }
    // });
    // const keyId = user.Item.keyId;

    // 開発時は環境変数から
    const keyId = process.env[`KMS_KEY_${event.userId.toUpperCase()}`];

    if (!keyId) {
      throw new Error('Wallet not found for user');
    }

    // ウォレットインスタンスを作成
    const wallet = new KmsWallet({ keyId });

    // メッセージに署名
    const signature = await wallet.personalSign(event.message);

    console.log('✓ Message signed');

    return {
      success: true,
      signature,
    };
  } catch (error) {
    console.error('Error signing message:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
