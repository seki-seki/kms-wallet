import {
  KMSClient,
  GetPublicKeyCommand,
  SignCommand,
  MessageType,
} from '@aws-sdk/client-kms';
import { ethers } from 'ethers';

export interface KmsWalletConfig {
  keyId: string;
  region?: string;
  kmsClient?: KMSClient;
}

export class KmsWallet {
  private keyId: string;
  private kmsClient: KMSClient;
  private cachedPublicKey?: Uint8Array;
  private cachedAddress?: string;

  constructor(config: KmsWalletConfig) {
    this.keyId = config.keyId;
    this.kmsClient = config.kmsClient || new KMSClient({
      region: config.region || process.env.AWS_REGION || 'ap-northeast-1'
    });
  }

  async getPublicKey(): Promise<Uint8Array> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }

    const command = new GetPublicKeyCommand({
      KeyId: this.keyId,
    });

    const response = await this.kmsClient.send(command);

    if (!response.PublicKey) {
      throw new Error('Failed to get public key from KMS');
    }

    // KMS returns DER-encoded public key, we need to extract the 65-byte uncompressed key
    const publicKeyDer = new Uint8Array(response.PublicKey);

    // The last 65 bytes of the DER encoding is the uncompressed public key (0x04 + 32 bytes X + 32 bytes Y)
    this.cachedPublicKey = publicKeyDer.slice(-65);

    return this.cachedPublicKey;
  }

  async getAddress(): Promise<string> {
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    const publicKey = await this.getPublicKey();

    // Remove the 0x04 prefix and hash the remaining 64 bytes
    const publicKeyBytes = publicKey.slice(1);
    const hash = ethers.keccak256(publicKeyBytes);

    // Take the last 20 bytes of the hash as the address
    this.cachedAddress = ethers.getAddress('0x' + hash.slice(-40));

    return this.cachedAddress;
  }

  async signTransaction(transaction: ethers.TransactionLike): Promise<string> {
    // Serialize the transaction
    const unsignedTx = ethers.Transaction.from(transaction);
    const txHash = unsignedTx.unsignedHash;

    // Sign with KMS
    const signature = await this.signDigest(ethers.getBytes(txHash));

    // Set the signature on the transaction
    unsignedTx.signature = signature;

    return unsignedTx.serialized;
  }

  async personalSign(message: string | Uint8Array): Promise<string> {
    // Create the Ethereum signed message hash
    const messageBytes = typeof message === 'string' ? ethers.toUtf8Bytes(message) : message;
    const messageHash = ethers.hashMessage(messageBytes);

    // Sign with KMS
    const signature = await this.signDigest(ethers.getBytes(messageHash));

    return signature.serialized;
  }

  private async signDigest(digest: Uint8Array): Promise<ethers.Signature> {
    const command = new SignCommand({
      KeyId: this.keyId,
      Message: digest,
      MessageType: MessageType.DIGEST,
      SigningAlgorithm: 'ECDSA_SHA_256',
    });

    const response = await this.kmsClient.send(command);

    if (!response.Signature) {
      throw new Error('Failed to sign with KMS');
    }

    // Parse DER signature
    const signatureBuffer = new Uint8Array(response.Signature);
    const { r, s } = this.parseDERSignature(signatureBuffer);

    // Determine the recovery parameter (v)
    const address = await this.getAddress();
    const v = await this.findRecoveryParam(digest, r, s, address);

    return ethers.Signature.from({
      r: '0x' + r.toString('hex'),
      s: '0x' + s.toString('hex'),
      v,
    });
  }

  private parseDERSignature(signature: Uint8Array): { r: Buffer; s: Buffer } {
    let offset = 0;

    // Check if it's a valid DER signature (0x30)
    if (signature[offset++] !== 0x30) {
      throw new Error('Invalid DER signature');
    }

    // Total length
    offset++; // skip length

    // R value
    if (signature[offset++] !== 0x02) {
      throw new Error('Invalid DER signature: R marker');
    }
    const rLength = signature[offset++];
    let r = Buffer.from(signature.slice(offset, offset + rLength));
    offset += rLength;

    // S value
    if (signature[offset++] !== 0x02) {
      throw new Error('Invalid DER signature: S marker');
    }
    const sLength = signature[offset++];
    let s = Buffer.from(signature.slice(offset, offset + sLength));

    // Remove leading zero bytes (DER padding)
    while (r.length > 32 && r[0] === 0x00) {
      r = r.slice(1);
    }
    while (s.length > 32 && s[0] === 0x00) {
      s = s.slice(1);
    }

    // Pad to 32 bytes if needed
    if (r.length < 32) {
      r = Buffer.concat([Buffer.alloc(32 - r.length, 0), r]);
    }
    if (s.length < 32) {
      s = Buffer.concat([Buffer.alloc(32 - s.length, 0), s]);
    }

    // Ethereum requires low-s values (s <= n/2)
    // secp256k1 curve order
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const halfN = n / 2n;

    const sBigInt = BigInt('0x' + s.toString('hex'));
    if (sBigInt > halfN) {
      const sNormalized = n - sBigInt;
      s = Buffer.from(sNormalized.toString(16).padStart(64, '0'), 'hex');
    }

    return { r, s };
  }

  private async findRecoveryParam(
    digest: Uint8Array,
    r: Buffer,
    s: Buffer,
    expectedAddress: string
  ): Promise<number> {
    // Try recovery parameter 0 and 1
    for (let v = 27; v <= 28; v++) {
      try {
        const signature = ethers.Signature.from({
          r: '0x' + r.toString('hex'),
          s: '0x' + s.toString('hex'),
          v,
        });

        const recoveredAddress = ethers.recoverAddress(digest, signature);

        if (recoveredAddress.toLowerCase() === expectedAddress.toLowerCase()) {
          return v;
        }
      } catch (e) {
        // Try next v value
      }
    }

    throw new Error('Failed to find valid recovery parameter');
  }
}
