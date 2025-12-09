import { ethers } from 'ethers';
import { KmsWallet } from './KmsWallet';

export interface KmsSignerConfig {
  kmsWallet: KmsWallet;
  provider?: ethers.Provider;
}

/**
 * Signer that uses AWS KMS for signing transactions
 * Compatible with ethers.js Signer interface
 *
 * @example
 * ```typescript
 * const kmsWallet = new KmsWallet({ keyId: 'your-key-id' });
 * const provider = new ethers.JsonRpcProvider('https://...');
 * const signer = new KmsSigner({ kmsWallet, provider });
 *
 * // Send transaction
 * const tx = await signer.sendTransaction({
 *   to: '0x...',
 *   value: ethers.parseEther('0.1'),
 * });
 * ```
 */
export class KmsSigner extends ethers.AbstractSigner {
  private kmsWallet: KmsWallet;
  private cachedAddress?: string;
  private nonceCache?: number; // Track nonce for sequential transactions

  constructor(config: KmsSignerConfig) {
    super(config.provider);
    this.kmsWallet = config.kmsWallet;
  }

  /**
   * Get the signer's address
   */
  async getAddress(): Promise<string> {
    if (!this.cachedAddress) {
      this.cachedAddress = await this.kmsWallet.getAddress();
    }
    return this.cachedAddress;
  }

  /**
   * Sign a transaction using KMS
   */
  async signTransaction(transaction: ethers.TransactionRequest): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider is required to sign transactions');
    }

    // Get address and nonce
    const from = await this.getAddress();

    // Use cached nonce if available, otherwise fetch from provider
    let nonce: number;
    if (transaction.nonce !== undefined) {
      nonce = Number(transaction.nonce);
    } else if (this.nonceCache !== undefined) {
      nonce = this.nonceCache;
    } else {
      nonce = await this.provider.getTransactionCount(from, 'pending');
    }

    const feeData = await this.provider.getFeeData();
    const network = await this.provider.getNetwork();

    // Resolve to address if needed
    const to = transaction.to ? await ethers.resolveAddress(transaction.to, this.provider) : undefined;

    // Determine transaction type and gas pricing
    const isEIP1559 = transaction.type === 2 ||
                      (transaction.maxFeePerGas !== undefined) ||
                      (transaction.maxPriorityFeePerGas !== undefined);

    // Prepare transaction with proper gas pricing
    const tx: ethers.TransactionLike = {
      to,
      value: transaction.value ?? 0,
      data: transaction.data,
      gasLimit: transaction.gasLimit ?? 21000,
      nonce: nonce,
      chainId: Number(network.chainId),
    };

    // Add gas pricing based on transaction type
    if (isEIP1559) {
      // EIP-1559 transaction
      tx.type = 2;
      tx.maxFeePerGas = transaction.maxFeePerGas ?? feeData.maxFeePerGas;
      tx.maxPriorityFeePerGas = transaction.maxPriorityFeePerGas ?? feeData.maxPriorityFeePerGas;
    } else {
      // Legacy transaction
      tx.type = 0;
      tx.gasPrice = transaction.gasPrice ?? feeData.gasPrice;
    }

    // Sign with KMS wallet
    const signedTx = await this.kmsWallet.signTransaction(tx);

    return signedTx;
  }

  /**
   * Send a transaction (sign and broadcast)
   * This overrides AbstractSigner's sendTransaction to handle nonce caching
   */
  async sendTransaction(transaction: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    if (!this.provider) {
      throw new Error('Provider is required to send transactions');
    }

    // Sign the transaction (this handles nonce internally)
    const signedTx = await this.signTransaction(transaction);

    // Broadcast the transaction
    const txResponse = await this.provider.broadcastTransaction(signedTx);

    // Update nonce cache only after successful broadcast
    if (this.nonceCache !== undefined) {
      this.nonceCache++;
    } else {
      // Initialize cache with current nonce + 1
      const address = await this.getAddress();
      const currentNonce = await this.provider.getTransactionCount(address, 'pending');
      this.nonceCache = currentNonce + 1;
    }

    return txResponse;
  }

  /**
   * Sign a message using KMS
   */
  async signMessage(message: string | Uint8Array): Promise<string> {
    return await this.kmsWallet.personalSign(message);
  }

  /**
   * Sign typed data (EIP-712)
   * Note: This is not yet implemented for KMS
   */
  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>
  ): Promise<string> {
    throw new Error('signTypedData is not yet implemented for KMS');
  }

  /**
   * Connect this signer to a different provider
   */
  connect(provider: ethers.Provider): KmsSigner {
    return new KmsSigner({
      kmsWallet: this.kmsWallet,
      provider,
    });
  }
}
