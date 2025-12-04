// amplify/functions/sign-transaction/handler.ts
import type { Handler } from 'aws-lambda';
import { KmsWallet } from 'kms-wallet';
import type { TransactionLike } from 'ethers';

interface SignTransactionEvent {
  userId: string;
  transaction: TransactionLike;
}

interface SignTransactionResponse {
  success: boolean;
  signedTx?: string;
  error?: string;
}

export const handler: Handler<SignTransactionEvent, SignTransactionResponse> = async (event) => {
  console.log('Signing transaction for user:', event.userId);

  try {
    // TODO: DBからkeyIdを取得
    const keyId = process.env[`KMS_KEY_${event.userId.toUpperCase()}`];

    if (!keyId) {
      throw new Error('Wallet not found for user');
    }

    // ウォレットインスタンスを作成
    const wallet = new KmsWallet({ keyId });

    // トランザクションに署名
    const signedTx = await wallet.signTransaction(event.transaction);

    console.log('✓ Transaction signed');

    return {
      success: true,
      signedTx,
    };
  } catch (error) {
    console.error('Error signing transaction:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
