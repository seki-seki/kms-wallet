import { ethers } from 'ethers';
import { KmsWallet } from './KmsWallet';

export interface KmsWalletProviderConfig {
  kmsWallet: KmsWallet;
  provider: ethers.Provider;
}

/**
 * Provider that wraps a KMS wallet for signing transactions
 * Can be used with ethers.js or web3.js
 */
export class KmsWalletProvider extends ethers.AbstractProvider {
  private kmsWallet: KmsWallet;
  private baseProvider: ethers.Provider;
  private cachedAddress?: string;
  private nonceCache?: number; // Track nonce for sequential transactions

  constructor(config: KmsWalletProviderConfig) {
    super();
    this.kmsWallet = config.kmsWallet;
    this.baseProvider = config.provider;
  }

  /**
   * Get the KMS wallet address
   */
  async getAddress(): Promise<string> {
    if (!this.cachedAddress) {
      this.cachedAddress = await this.kmsWallet.getAddress();
    }
    return this.cachedAddress;
  }

  /**
   * Send a transaction using KMS wallet for signing
   */
  async sendTransaction(transaction: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    // Get address and nonce
    const from = await this.getAddress();

    // Use cached nonce if available, otherwise fetch from provider
    let nonce: number;
    if (transaction.nonce !== undefined) {
      nonce = Number(transaction.nonce);
    } else if (this.nonceCache !== undefined) {
      nonce = this.nonceCache;
    } else {
      nonce = await this.baseProvider.getTransactionCount(from, 'pending');
    }

    const feeData = await this.baseProvider.getFeeData();
    const network = await this.baseProvider.getNetwork();

    // Resolve to address if needed
    const to = transaction.to ? await ethers.resolveAddress(transaction.to, this.baseProvider) : undefined;

    // Prepare transaction
    const tx: ethers.TransactionLike = {
      to,
      value: transaction.value ?? 0,
      data: transaction.data,
      gasLimit: transaction.gasLimit ?? 21000,
      gasPrice: transaction.gasPrice ?? feeData.gasPrice,
      nonce: nonce,
      chainId: Number(network.chainId),
      type: transaction.type,
    };

    // Sign with KMS wallet
    const signedTx = await this.kmsWallet.signTransaction(tx);

    // Broadcast transaction
    const txResponse = await this.baseProvider.broadcastTransaction(signedTx);

    // Update nonce cache for next transaction
    this.nonceCache = nonce + 1;

    return txResponse;
  }

  /**
   * Sign a message using KMS wallet
   */
  async signMessage(message: string | Uint8Array): Promise<string> {
    return await this.kmsWallet.personalSign(message);
  }

  // Delegate all other methods to base provider
  async getBlockNumber(): Promise<number> {
    return await this.baseProvider.getBlockNumber();
  }

  async getNetwork(): Promise<ethers.Network> {
    return await this.baseProvider.getNetwork();
  }

  async getFeeData(): Promise<ethers.FeeData> {
    return await this.baseProvider.getFeeData();
  }

  async getBalance(
    addressOrName: string | Promise<string>,
    blockTag?: ethers.BlockTag
  ): Promise<bigint> {
    return await this.baseProvider.getBalance(addressOrName, blockTag);
  }

  async getTransactionCount(
    addressOrName: string | Promise<string>,
    blockTag?: ethers.BlockTag
  ): Promise<number> {
    return await this.baseProvider.getTransactionCount(addressOrName, blockTag);
  }

  async getCode(
    addressOrName: string | Promise<string>,
    blockTag?: ethers.BlockTag
  ): Promise<string> {
    return await this.baseProvider.getCode(addressOrName, blockTag);
  }

  async getStorage(
    addressOrName: string | Promise<string>,
    position: ethers.BigNumberish,
    blockTag?: ethers.BlockTag
  ): Promise<string> {
    return await this.baseProvider.getStorage(addressOrName, position, blockTag);
  }

  async call(transaction: ethers.TransactionRequest): Promise<string> {
    return await this.baseProvider.call(transaction);
  }

  async estimateGas(transaction: ethers.TransactionRequest): Promise<bigint> {
    return await this.baseProvider.estimateGas(transaction);
  }

  async getBlock(
    blockHashOrBlockTag: ethers.BlockTag,
    prefetchTxs?: boolean
  ): Promise<null | ethers.Block> {
    return await this.baseProvider.getBlock(blockHashOrBlockTag, prefetchTxs);
  }

  async getTransaction(
    transactionHash: string
  ): Promise<null | ethers.TransactionResponse> {
    return await this.baseProvider.getTransaction(transactionHash);
  }

  async getTransactionReceipt(
    transactionHash: string
  ): Promise<null | ethers.TransactionReceipt> {
    return await this.baseProvider.getTransactionReceipt(transactionHash);
  }

  async broadcastTransaction(signedTx: string): Promise<ethers.TransactionResponse> {
    return await this.baseProvider.broadcastTransaction(signedTx);
  }

  // Required abstract methods from AbstractProvider
  async _perform(req: ethers.PerformActionRequest): Promise<any> {
    // Delegate to base provider
    if ('getBlockNumber' in this.baseProvider) {
      return await (this.baseProvider as any)._perform(req);
    }
    throw new Error('Method not implemented: _perform');
  }

  // Unimplemented methods throw errors
  async resolveName(name: string): Promise<null | string> {
    throw new Error('Method not implemented: resolveName');
  }

  async lookupAddress(address: string): Promise<null | string> {
    throw new Error('Method not implemented: lookupAddress');
  }

  async waitForTransaction(
    transactionHash: string,
    confirms?: number,
    timeout?: number
  ): Promise<null | ethers.TransactionReceipt> {
    return await this.baseProvider.waitForTransaction(transactionHash, confirms, timeout);
  }

  async waitForBlock(blockTag?: ethers.BlockTag): Promise<ethers.Block> {
    return await this.baseProvider.waitForBlock(blockTag);
  }
}
