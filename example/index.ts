import { KmsWallet } from 'kms-wallet';
import { ethers } from 'ethers';
import amplifyOutputs from './amplify_outputs.json';

async function main() {
  console.log('=== KMS Wallet Example ===\n');

  // Load KMS Key ID from amplify_outputs.json or environment variable
  const KMS_KEY_ID = amplifyOutputs.custom?.kmsKeyId || process.env.KMS_KEY_ID;

  if (!KMS_KEY_ID) {
    console.error('❌ KMS Key ID not found!\n');
    console.error('Please run: npx ampx sandbox\n');
    process.exit(1);
  }

  console.log('KMS Key ID:', KMS_KEY_ID);
  console.log();

  // Initialize the KMS wallet
  const wallet = new KmsWallet({
    keyId: KMS_KEY_ID,
  });

  try {
    // 1. Get public key
    console.log('1. Getting public key...');
    const publicKey = await wallet.getPublicKey();
    console.log('Public Key (hex):', Buffer.from(publicKey).toString('hex'));
    console.log();

    // 2. Get Ethereum address
    console.log('2. Getting Ethereum address...');
    const address = await wallet.getAddress();
    console.log('Ethereum Address:', address);
    console.log();

    // 3. Sign a personal message
    console.log('3. Signing personal message...');
    const message = 'Hello, Ethereum!';
    const personalSignature = await wallet.personalSign(message);
    console.log('Message:', message);
    console.log('Signature:', personalSignature);

    // Verify the signature
    const recoveredAddress = ethers.verifyMessage(message, personalSignature);
    console.log('Recovered Address:', recoveredAddress);
    console.log('Signature Valid:', recoveredAddress.toLowerCase() === address.toLowerCase());
    console.log();

    // 4. Sign a transaction
    console.log('4. Signing transaction...');
    const transaction: ethers.TransactionLike = {
      to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0',
      value: ethers.parseEther('0.001'),
      gasLimit: 21000,
      gasPrice: ethers.parseUnits('20', 'gwei'),
      nonce: 0,
      chainId: 1, // Ethereum mainnet
    };

    const signedTx = await wallet.signTransaction(transaction);
    console.log('Signed Transaction:', signedTx);

    // Parse the signed transaction to verify
    const parsedTx = ethers.Transaction.from(signedTx);
    console.log('Transaction From:', parsedTx.from);
    console.log('Transaction Valid:', parsedTx.from?.toLowerCase() === address.toLowerCase());

  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  }
}

main();
