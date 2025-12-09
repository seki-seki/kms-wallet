import { ethers } from 'ethers';
import Ganache from 'ganache';
import { KmsWallet, KmsWalletProvider } from '../src';
import { KMSClient, ScheduleKeyDeletionCommand } from '@aws-sdk/client-kms';

describe('KMS Wallet', () => {
  let ganacheServer: ReturnType<typeof Ganache.server>;
  let provider: ethers.JsonRpcProvider;
  let fundingWallet: ethers.Wallet;
  let testKmsKeyId: string | undefined;
  let createdKmsKeyIds: string[] = []; // Track all created keys for cleanup
  const PORT = 8545;

  beforeAll(async () => {
    // Start Ganache server for testing
    ganacheServer = Ganache.server({
      wallet: {
        totalAccounts: 10,
        defaultBalance: 1000,
      },
      chain: {
        chainId: 1337,
      },
      logging: {
        quiet: true,
      },
    } as any);

    await ganacheServer.listen(PORT);

    // Connect to Ganache
    provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`);

    // Get funding wallet from Ganache
    const accounts = await provider.listAccounts();
    fundingWallet = accounts[0] as any;

    // Create KMS key for testing if AWS_PROFILE is set
    if (process.env.AWS_PROFILE) {
      try {
        console.log('Creating KMS key for testing...');
        const { keyId } = await KmsWallet.create({
          description: 'Test key created by jest (auto-cleanup)',
          tags: {
            Environment: 'test',
            CreatedBy: 'jest',
            AutoCleanup: 'true',
          },
        });
        testKmsKeyId = keyId;
        createdKmsKeyIds.push(keyId);
        console.log(`Created test KMS key: ${keyId}`);
      } catch (error) {
        console.warn('Failed to create KMS key, tests will be skipped:', error);
      }
    }
  });

  afterAll(async () => {
    if (ganacheServer) {
      await ganacheServer.close();
    }

    // Schedule deletion of all created KMS keys (7 days minimum waiting period)
    if (createdKmsKeyIds.length > 0 && process.env.AWS_PROFILE) {
      const kmsClient = new KMSClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

      for (const keyId of createdKmsKeyIds) {
        try {
          await kmsClient.send(new ScheduleKeyDeletionCommand({
            KeyId: keyId,
            PendingWindowInDays: 7, // Minimum allowed by AWS
          }));
          console.log(`✓ Scheduled deletion of KMS key: ${keyId} (7 days)`);
        } catch (error) {
          console.warn(`Failed to schedule KMS key deletion: ${keyId}`, error);
          console.log('To delete manually: aws kms schedule-key-deletion --key-id', keyId);
        }
      }
    }
  });

  describe('KmsWallet', () => {
    const getKmsKeyId = () => testKmsKeyId;

    describe('基本的な使い方', () => {
      it('KmsWalletインスタンスを作成できる', async () => {
        if (!getKmsKeyId()) {
          console.log('Skipping: No KMS key available');
          return;
        }
        const wallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        expect(wallet).toBeDefined();
      });

      it('Ethereumアドレスを取得できる', async () => {
        const wallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const address = await wallet.getAddress();

        expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        console.log(`Ethereum address: ${address}`);
      });

      it('公開鍵を取得できる', async () => {
        const wallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const publicKey = await wallet.getPublicKey();

        expect(publicKey).toBeInstanceOf(Uint8Array);
        expect(publicKey.length).toBe(65); // Uncompressed public key
        console.log(`Public key length: ${publicKey.length} bytes`);
      });
    });

    describe('メッセージ署名', () => {
      it('文字列メッセージに署名できる', async () => {
        const wallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const message = 'Hello, Ethereum!';
        const signature = await wallet.personalSign(message);

        expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
        console.log(`Signature: ${signature.substring(0, 20)}...`);
      });

      it('署名を検証できる', async () => {
        const wallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const message = 'Test message';
        const signature = await wallet.personalSign(message);
        const address = await wallet.getAddress();

        const recoveredAddress = ethers.verifyMessage(message, signature);

        expect(recoveredAddress.toLowerCase()).toBe(address.toLowerCase());
        console.log(`✓ Signature verified for address: ${address}`);
      });
    });

    describe('トランザクション署名', () => {
      it('トランザクションに署名できる', async () => {
        const wallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const address = await wallet.getAddress();
        const nonce = await provider.getTransactionCount(address);
        const feeData = await provider.getFeeData();

        const signedTx = await wallet.signTransaction({
          to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0',
          value: ethers.parseEther('0.1'),
          gasLimit: 21000,
          gasPrice: feeData.gasPrice,
          nonce: nonce,
          chainId: 1337,
        });

        expect(signedTx).toMatch(/^0x/);
        expect(signedTx.length).toBeGreaterThan(100);
        console.log(`✓ Transaction signed: ${signedTx.substring(0, 20)}...`);
      });

      it('署名されたトランザクションを検証できる', async () => {
        const wallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const address = await wallet.getAddress();
        const nonce = await provider.getTransactionCount(address);
        const feeData = await provider.getFeeData();

        const signedTx = await wallet.signTransaction({
          to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0',
          value: ethers.parseEther('0.1'),
          gasLimit: 21000,
          gasPrice: feeData.gasPrice,
          nonce: nonce,
          chainId: 1337,
        });

        const parsedTx = ethers.Transaction.from(signedTx);

        expect(parsedTx.from?.toLowerCase()).toBe(address.toLowerCase());
        console.log(`✓ Transaction from: ${parsedTx.from}`);
      });
    });

    describe('KMS Keyの作成', () => {
      it('KmsWallet.create()で新しいウォレットを作成できる', async () => {
        if (!process.env.AWS_PROFILE) {
          console.log('Skipping: No AWS_PROFILE set');
          return;
        }

        const { wallet, keyId, address, publicKey } = await KmsWallet.create({
          description: 'Test wallet created by jest (will be auto-deleted)',
          tags: {
            Environment: 'test',
            CreatedBy: 'jest',
            AutoCleanup: 'true',
          },
        });

        // Track for cleanup
        createdKmsKeyIds.push(keyId);

        expect(wallet).toBeInstanceOf(KmsWallet);
        expect(keyId).toBeDefined();
        expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(publicKey).toBeDefined();

        console.log(`✓ Created new wallet:`);
        console.log(`  Key ID: ${keyId}`);
        console.log(`  Address: ${address}`);
        console.log(`  Public Key: ${publicKey.substring(0, 20)}...`);
      });
    });
  });

  describe('KmsWalletProvider', () => {
    const getKmsKeyId = () => testKmsKeyId;
    const hasKmsKey = () => !!getKmsKeyId();

    describe('基本的な使い方', () => {
      it('KmsWalletProviderインスタンスを作成できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        expect(kmsProvider).toBeDefined();
      });

      it('アドレスを取得できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const address = await kmsProvider.getAddress();

        expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        console.log(`KmsWalletProvider address: ${address}`);
      });

      it('残高を取得できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const address = await kmsProvider.getAddress();
        const balance = await kmsProvider.getBalance(address);

        expect(balance).toBeGreaterThanOrEqual(0n);
        console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
      });
    });

    describe('トランザクション送信', () => {
      it('トランザクションを送信できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const address = await kmsProvider.getAddress();

        // Fund the KMS wallet
        const fundTx = await fundingWallet.sendTransaction({
          to: address,
          value: ethers.parseEther('1.0'),
        });
        await fundTx.wait();

        // Send transaction using KmsWalletProvider
        const recipient = ethers.Wallet.createRandom().address;
        const tx = await kmsProvider.sendTransaction({
          to: recipient,
          value: ethers.parseEther('0.1'),
        });

        expect(tx.hash).toBeDefined();
        console.log(`✓ Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();

        expect(receipt?.status).toBe(1);
        console.log(`✓ Transaction confirmed in block ${receipt?.blockNumber}`);
      });

      it('複数のトランザクションを順次送信できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const address = await kmsProvider.getAddress();

        // Fund the KMS wallet
        const fundTx = await fundingWallet.sendTransaction({
          to: address,
          value: ethers.parseEther('2.0'),
        });
        await fundTx.wait();

        // Send multiple transactions
        const recipient = ethers.Wallet.createRandom().address;
        const txCount = 3;
        const txHashes: string[] = [];

        for (let i = 0; i < txCount; i++) {
          const tx = await kmsProvider.sendTransaction({
            to: recipient,
            value: ethers.parseEther('0.1'),
          });

          const receipt = await tx.wait();
          txHashes.push(tx.hash);

          console.log(`✓ Transaction ${i + 1}/${txCount}: ${tx.hash}`);
          expect(receipt?.status).toBe(1);
        }

        expect(txHashes.length).toBe(txCount);
      });
    });

    describe('メッセージ署名', () => {
      it('メッセージに署名できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const message = 'Sign this message';
        const signature = await kmsProvider.signMessage(message);

        expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
        console.log(`✓ Message signed: ${signature.substring(0, 20)}...`);
      });

      it('署名を検証できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const message = 'Verify this signature';
        const signature = await kmsProvider.signMessage(message);
        const address = await kmsProvider.getAddress();

        const recoveredAddress = ethers.verifyMessage(message, signature);

        expect(recoveredAddress.toLowerCase()).toBe(address.toLowerCase());
        console.log(`✓ Signature verified`);
      });
    });

    describe('Provider機能', () => {
      it('ブロック番号を取得できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const blockNumber = await kmsProvider.getBlockNumber();

        expect(blockNumber).toBeGreaterThanOrEqual(0);
        console.log(`Current block: ${blockNumber}`);
      });

      it('ネットワーク情報を取得できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const network = await kmsProvider.getNetwork();

        expect(network.chainId).toBe(1337n);
        console.log(`Network: chainId ${network.chainId}`);
      });

      it('ガス価格を取得できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const kmsProvider = new KmsWalletProvider({
          kmsWallet,
          provider,
        });

        const feeData = await kmsProvider.getFeeData();

        expect(feeData.gasPrice).toBeDefined();
        console.log(`Gas price: ${ethers.formatUnits(feeData.gasPrice!, 'gwei')} gwei`);
      });
    });
  });

  describe('使用例', () => {
    describe('シンプルなウォレット統合', () => {
      it('通常のethers.Walletと同様に使用できる（モック）', async () => {
        // KMS Walletがない場合は通常のウォレットで動作確認
        const testWallet = ethers.Wallet.createRandom().connect(provider);

        // Fund the wallet
        const fundTx = await fundingWallet.sendTransaction({
          to: testWallet.address,
          value: ethers.parseEther('1.0'),
        });
        await fundTx.wait();

        // Get address
        const address = testWallet.address;
        expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        console.log(`Wallet address: ${address}`);

        // Get balance
        const balance = await provider.getBalance(address);
        expect(balance).toBeGreaterThan(0n);
        console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

        // Send transaction
        const recipient = ethers.Wallet.createRandom().address;
        const tx = await testWallet.sendTransaction({
          to: recipient,
          value: ethers.parseEther('0.1'),
        });

        const receipt = await tx.wait();
        expect(receipt?.status).toBe(1);
        console.log(`✓ Transaction confirmed: ${tx.hash}`);

        // Sign message
        const message = 'Hello from wallet!';
        const signature = await testWallet.signMessage(message);
        expect(signature).toBeDefined();

        // Verify signature
        const recoveredAddress = ethers.verifyMessage(message, signature);
        expect(recoveredAddress.toLowerCase()).toBe(address.toLowerCase());
        console.log(`✓ Message signature verified`);
      });
    });
  });
});
