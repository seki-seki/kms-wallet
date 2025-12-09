import { KMSClient, SignCommand, CreateKeyCommand, DescribeKeyCommand, TagResourceCommand, KeySpec, KeyUsageType } from '@aws-sdk/client-kms';
import { ethers } from 'ethers';

export interface KmsHdWalletConfig {
  /**
   * KMS Key ID used for deterministic seed generation
   */
  keyId: string;

  /**
   * AWS region (optional, defaults to environment)
   */
  region?: string;

  /**
   * Base derivation path (optional, defaults to "m/44'/60'/0'/0")
   * This is the Ethereum standard path
   */
  basePath?: string;
}

export interface CreateKmsHdWalletConfig {
  /**
   * Description for the KMS key
   */
  description?: string;

  /**
   * AWS region (optional, defaults to environment)
   */
  region?: string;

  /**
   * Tags for the KMS key
   */
  tags?: Record<string, string>;

  /**
   * Base derivation path (optional)
   */
  basePath?: string;
}

export interface CreateKmsHdWalletResult {
  /**
   * KmsHdWallet instance
   */
  wallet: KmsHdWallet;

  /**
   * KMS Key ID
   */
  keyId: string;

  /**
   * First derived address (index 0)
   */
  firstAddress: string;

  /**
   * Base derivation path used
   */
  basePath: string;
}

/**
 * HD Wallet (Hierarchical Deterministic Wallet) using AWS KMS for seed generation
 *
 * Uses KMS signature as deterministic seed for BIP32/BIP44 derivation.
 * One KMS key can generate unlimited child wallets.
 *
 * @example
 * ```typescript
 * // Create master key and HD wallet
 * const { wallet, keyId } = await KmsHdWallet.create({
 *   description: 'Master HD Wallet Key'
 * });
 *
 * // Derive addresses for different users
 * const alice = await wallet.getAddress(0);
 * const bob = await wallet.getAddress(1);
 *
 * // Sign transaction for specific user
 * const aliceSigner = await wallet.getSigner(0, provider);
 * const tx = await aliceSigner.sendTransaction({...});
 * ```
 */
export class KmsHdWallet {
  private kmsClient: KMSClient;
  private keyId: string;
  private basePath: string;
  private cachedSeed?: Buffer;
  private cachedMasterNode?: ethers.HDNodeWallet;

  constructor(config: KmsHdWalletConfig) {
    this.kmsClient = new KMSClient({
      region: config.region || process.env.AWS_REGION || 'ap-northeast-1',
    });
    this.keyId = config.keyId;
    this.basePath = config.basePath || "m/44'/60'/0'/0"; // Ethereum standard
  }

  /**
   * Create a new KMS key and HD wallet
   */
  static async create(config: CreateKmsHdWalletConfig = {}): Promise<CreateKmsHdWalletResult> {
    const kmsClient = new KMSClient({
      region: config.region || process.env.AWS_REGION || 'ap-northeast-1',
    });

    // Create KMS key for seed generation
    const createKeyResponse = await kmsClient.send(
      new CreateKeyCommand({
        Description: config.description || 'HD Wallet Master Key (seed generation)',
        KeySpec: KeySpec.ECC_SECG_P256K1,
        KeyUsage: KeyUsageType.SIGN_VERIFY,
      })
    );

    const keyId = createKeyResponse.KeyMetadata!.KeyId!;

    // Add tags if provided
    if (config.tags && Object.keys(config.tags).length > 0) {
      const keyArn = createKeyResponse.KeyMetadata!.Arn!;
      await kmsClient.send(
        new TagResourceCommand({
          KeyId: keyArn,
          Tags: Object.entries(config.tags).map(([Key, Value]) => ({
            TagKey: Key,
            TagValue: Value,
          })),
        })
      );
    }

    const wallet = new KmsHdWallet({
      keyId,
      region: config.region,
      basePath: config.basePath,
    });

    const firstAddress = await wallet.getAddress(0);

    return {
      wallet,
      keyId,
      firstAddress,
      basePath: wallet.basePath,
    };
  }

  /**
   * Derive deterministic seed from KMS key signature
   * The seed is cached for performance
   */
  private async deriveSeed(): Promise<Buffer> {
    if (this.cachedSeed) {
      return this.cachedSeed;
    }

    // Sign a deterministic message to generate seed
    const message = 'BIP32_HD_WALLET_MASTER_SEED_DERIVATION';
    const messageHash = ethers.hashMessage(message);
    const messageBytes = Buffer.from(messageHash.slice(2), 'hex');

    const signResponse = await this.kmsClient.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: messageBytes,
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      })
    );

    if (!signResponse.Signature) {
      throw new Error('Failed to generate signature from KMS');
    }

    // Use signature as seed (deterministic for same KMS key)
    this.cachedSeed = Buffer.from(signResponse.Signature);
    return this.cachedSeed;
  }

  /**
   * Get master HD node (cached)
   */
  private async getMasterNode(): Promise<ethers.HDNodeWallet> {
    if (this.cachedMasterNode) {
      return this.cachedMasterNode;
    }

    const seed = await this.deriveSeed();

    // Use signature as entropy to create a valid BIP39 mnemonic
    // ethers.Mnemonic.entropyToPhrase expects 16, 20, 24, 28, or 32 bytes
    let entropy = seed;
    if (seed.length > 32) {
      // If signature is longer than 32 bytes, hash it to get 32 bytes
      const hash = ethers.keccak256(seed);
      entropy = Buffer.from(hash.slice(2), 'hex');
    } else if (seed.length < 16) {
      // If signature is shorter than 16 bytes, hash it
      const hash = ethers.keccak256(seed);
      entropy = Buffer.from(hash.slice(2), 'hex');
    }

    // Create mnemonic from entropy
    const mnemonic = ethers.Mnemonic.fromEntropy(entropy);

    // Create HD node from mnemonic
    this.cachedMasterNode = ethers.HDNodeWallet.fromPhrase(mnemonic.phrase);
    return this.cachedMasterNode;
  }

  /**
   * Derive child wallet at specific index
   * @param index Account index (0, 1, 2, ...)
   */
  private async deriveChild(index: number): Promise<ethers.HDNodeWallet> {
    const masterNode = await this.getMasterNode();

    // Master node is at "m/", so we need to use the full base path + index
    // Remove "m/" prefix if present in basePath
    const relativePath = this.basePath.startsWith('m/')
      ? this.basePath.slice(2)
      : this.basePath;

    const fullPath = `${relativePath}/${index}`;
    return masterNode.derivePath(fullPath) as ethers.HDNodeWallet;
  }

  /**
   * Get Ethereum address for specific account index
   * @param index Account index (0 for first user, 1 for second, etc.)
   */
  async getAddress(index: number): Promise<string> {
    const child = await this.deriveChild(index);
    return child.address;
  }

  /**
   * Get private key for specific account index
   * WARNING: Use with caution. Consider using getSigner() instead.
   * @param index Account index
   */
  async getPrivateKey(index: number): Promise<string> {
    const child = await this.deriveChild(index);
    return child.privateKey;
  }

  /**
   * Get public key for specific account index
   * @param index Account index
   */
  async getPublicKey(index: number): Promise<string> {
    const child = await this.deriveChild(index);
    return child.publicKey;
  }

  /**
   * Sign a message with specific account
   * @param index Account index
   * @param message Message to sign
   */
  async signMessage(index: number, message: string | Uint8Array): Promise<string> {
    const child = await this.deriveChild(index);
    return await child.signMessage(message);
  }

  /**
   * Sign a transaction with specific account
   * @param index Account index
   * @param transaction Transaction to sign
   */
  async signTransaction(index: number, transaction: ethers.TransactionRequest): Promise<string> {
    const child = await this.deriveChild(index);
    return await child.signTransaction(transaction);
  }

  /**
   * Get an ethers.js Wallet for specific account
   * @param index Account index
   * @param provider Optional provider to connect
   */
  async getWallet(index: number, provider?: ethers.Provider): Promise<ethers.Wallet> {
    const child = await this.deriveChild(index);
    const wallet = new ethers.Wallet(child.privateKey);
    return provider ? wallet.connect(provider) : wallet;
  }

  /**
   * Get an ethers.js Signer for specific account (alias for getWallet)
   * @param index Account index
   * @param provider Provider to connect to
   */
  async getSigner(index: number, provider: ethers.Provider): Promise<ethers.Wallet> {
    return this.getWallet(index, provider);
  }

  /**
   * Get KMS Key ID
   */
  getKeyId(): string {
    return this.keyId;
  }

  /**
   * Get base derivation path
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Derive multiple addresses at once
   * @param count Number of addresses to derive
   * @param startIndex Starting index (default: 0)
   */
  async getAddresses(count: number, startIndex: number = 0): Promise<string[]> {
    const addresses: string[] = [];
    for (let i = 0; i < count; i++) {
      addresses.push(await this.getAddress(startIndex + i));
    }
    return addresses;
  }
}
