import { ethers } from 'ethers';
import Ganache from 'ganache';
import { KmsWallet, KmsSigner, KmsHdWallet } from '../src';
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

  describe('KmsSigner', () => {
    const getKmsKeyId = () => testKmsKeyId;
    const hasKmsKey = () => !!getKmsKeyId();

    describe('基本的な使い方', () => {
      it('KmsSignerインスタンスを作成できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        expect(signer).toBeDefined();
      });

      it('アドレスを取得できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        const address = await signer.getAddress();

        expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        console.log(`KmsSigner address: ${address}`);
      });

      it('残高を取得できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        const address = await signer.getAddress();
        const balance = await provider.getBalance(address);

        expect(balance).toBeGreaterThanOrEqual(0n);
        console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
      });
    });

    describe('トランザクション送信', () => {
      it('トランザクションを送信できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        const address = await signer.getAddress();

        // Fund the KMS wallet
        const fundTx = await fundingWallet.sendTransaction({
          to: address,
          value: ethers.parseEther('1.0'),
        });
        await fundTx.wait();

        // Send transaction using KmsSigner
        const recipient = ethers.Wallet.createRandom().address;
        const tx = await signer.sendTransaction({
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

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        const address = await signer.getAddress();

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
          const tx = await signer.sendTransaction({
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

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        const message = 'Sign this message';
        const signature = await signer.signMessage(message);

        expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
        console.log(`✓ Message signed: ${signature.substring(0, 20)}...`);
      });

      it('署名を検証できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        const message = 'Verify this signature';
        const signature = await signer.signMessage(message);
        const address = await signer.getAddress();

        const recoveredAddress = ethers.verifyMessage(message, signature);

        expect(recoveredAddress.toLowerCase()).toBe(address.toLowerCase());
        console.log(`✓ Signature verified`);
      });
    });

    describe('Signer機能', () => {
      it('Providerに接続できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        expect(signer.provider).toBe(provider);
      });

      it('connect()で新しいSignerを作成できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const signer = new KmsSigner({
          kmsWallet,
        });

        const connectedSigner = signer.connect(provider);

        expect(connectedSigner).toBeInstanceOf(KmsSigner);
        expect(connectedSigner.provider).toBe(provider);
        console.log(`✓ Signer connected to provider`);
      });

      it('Providerを通してブロック番号を取得できる', async () => {
        const kmsWallet = new KmsWallet({
          keyId: getKmsKeyId()!,
        });

        const signer = new KmsSigner({
          kmsWallet,
          provider,
        });

        const blockNumber = await signer.provider!.getBlockNumber();

        expect(blockNumber).toBeGreaterThanOrEqual(0);
        console.log(`Current block: ${blockNumber}`);
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

  describe('KmsHdWallet (HD Wallet)', () => {
    let hdWalletKeyId: string | undefined;

    describe('HDウォレット作成', () => {
      it('HDウォレットを作成できる', async () => {
        if (!process.env.AWS_PROFILE) {
          console.log('Skipping: No AWS_PROFILE set');
          return;
        }

        const { wallet, keyId, firstAddress, basePath } = await KmsHdWallet.create({
          description: 'Test HD Wallet (auto-cleanup)',
          tags: {
            Environment: 'test',
            CreatedBy: 'jest',
            AutoCleanup: 'true',
          },
        });

        hdWalletKeyId = keyId;
        createdKmsKeyIds.push(keyId);

        expect(wallet).toBeInstanceOf(KmsHdWallet);
        expect(keyId).toBeDefined();
        expect(firstAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(basePath).toBe("m/44'/60'/0'/0");

        console.log(`✓ Created HD wallet:`);
        console.log(`  Key ID: ${keyId}`);
        console.log(`  First address: ${firstAddress}`);
        console.log(`  Base path: ${basePath}`);
      });
    });

    describe('アドレス導出', () => {
      it('複数のアドレスを導出できる', async () => {
        if (!hdWalletKeyId) {
          console.log('Skipping: No HD wallet created');
          return;
        }

        const hdWallet = new KmsHdWallet({ keyId: hdWalletKeyId });

        const address0 = await hdWallet.getAddress(0);
        const address1 = await hdWallet.getAddress(1);
        const address2 = await hdWallet.getAddress(2);

        expect(address0).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(address1).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(address2).toMatch(/^0x[a-fA-F0-9]{40}$/);

        // すべて異なるアドレス
        expect(address0).not.toBe(address1);
        expect(address1).not.toBe(address2);
        expect(address0).not.toBe(address2);

        console.log(`✓ Derived addresses:`);
        console.log(`  [0]: ${address0}`);
        console.log(`  [1]: ${address1}`);
        console.log(`  [2]: ${address2}`);
      });

      it('同じインデックスは常に同じアドレスを返す', async () => {
        if (!hdWalletKeyId) {
          console.log('Skipping: No HD wallet created');
          return;
        }

        const hdWallet = new KmsHdWallet({ keyId: hdWalletKeyId });

        const address1 = await hdWallet.getAddress(0);
        const address2 = await hdWallet.getAddress(0);

        expect(address1).toBe(address2);
        console.log(`✓ Deterministic address: ${address1}`);
      });

      it('複数アドレスを一括取得できる', async () => {
        if (!hdWalletKeyId) {
          console.log('Skipping: No HD wallet created');
          return;
        }

        const hdWallet = new KmsHdWallet({ keyId: hdWalletKeyId });
        const addresses = await hdWallet.getAddresses(5);

        expect(addresses).toHaveLength(5);
        addresses.forEach((addr, idx) => {
          expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
          console.log(`  [${idx}]: ${addr}`);
        });
      });
    });

    describe('署名機能', () => {
      it('メッセージに署名できる', async () => {
        if (!hdWalletKeyId) {
          console.log('Skipping: No HD wallet created');
          return;
        }

        const hdWallet = new KmsHdWallet({ keyId: hdWalletKeyId });
        const message = 'Hello from HD Wallet!';
        const signature = await hdWallet.signMessage(0, message);

        expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

        // 署名検証
        const address = await hdWallet.getAddress(0);
        const recoveredAddress = ethers.verifyMessage(message, signature);
        expect(recoveredAddress.toLowerCase()).toBe(address.toLowerCase());

        console.log(`✓ Message signed and verified for index 0`);
      });

      it('異なるインデックスで異なる署名', async () => {
        if (!hdWalletKeyId) {
          console.log('Skipping: No HD wallet created');
          return;
        }

        const hdWallet = new KmsHdWallet({ keyId: hdWalletKeyId });
        const message = 'Same message';

        const sig0 = await hdWallet.signMessage(0, message);
        const sig1 = await hdWallet.signMessage(1, message);

        expect(sig0).not.toBe(sig1);
        console.log(`✓ Different signatures for different indices`);
      });
    });

    describe('トランザクション送信', () => {
      it('HDウォレットでトランザクションを送信できる', async () => {
        if (!hdWalletKeyId) {
          console.log('Skipping: No HD wallet created');
          return;
        }

        const hdWallet = new KmsHdWallet({ keyId: hdWalletKeyId });

        // インデックス0のウォレット取得
        const signer = await hdWallet.getSigner(0, provider);
        const address = await signer.getAddress();

        // 資金供給
        const fundTx = await fundingWallet.sendTransaction({
          to: address,
          value: ethers.parseEther('1.0'),
        });
        await fundTx.wait();

        // トランザクション送信
        const recipient = ethers.Wallet.createRandom().address;
        const tx = await signer.sendTransaction({
          to: recipient,
          value: ethers.parseEther('0.1'),
        });

        expect(tx.hash).toBeDefined();
        console.log(`✓ Transaction sent from HD wallet index 0: ${tx.hash}`);

        const receipt = await tx.wait();
        expect(receipt?.status).toBe(1);
        console.log(`✓ Transaction confirmed in block ${receipt?.blockNumber}`);
      });

      it('複数インデックスから個別にトランザクション送信できる', async () => {
        if (!hdWalletKeyId) {
          console.log('Skipping: No HD wallet created');
          return;
        }

        const hdWallet = new KmsHdWallet({ keyId: hdWalletKeyId });

        // インデックス1のウォレット
        const signer1 = await hdWallet.getSigner(1, provider);
        const address1 = await signer1.getAddress();

        // 資金供給
        const fundTx = await fundingWallet.sendTransaction({
          to: address1,
          value: ethers.parseEther('0.5'),
        });
        await fundTx.wait();

        // トランザクション送信
        const recipient = ethers.Wallet.createRandom().address;
        const tx = await signer1.sendTransaction({
          to: recipient,
          value: ethers.parseEther('0.1'),
        });

        const receipt = await tx.wait();
        expect(receipt?.status).toBe(1);
        console.log(`✓ Transaction from HD wallet index 1: ${tx.hash}`);
      });
    });

    describe('コスト削減の検証', () => {
      it('1つのKMSキーで複数ウォレットを管理', async () => {
        if (!hdWalletKeyId) {
          console.log('Skipping: No HD wallet created');
          return;
        }

        const hdWallet = new KmsHdWallet({ keyId: hdWalletKeyId });

        // 10個のアドレスを導出
        const addresses = await hdWallet.getAddresses(10);

        expect(addresses).toHaveLength(10);
        console.log(`✓ Generated 10 addresses from single KMS key:`);
        console.log(`  KMS Key: ${hdWalletKeyId}`);
        console.log(`  Cost: $1/month (fixed)`);
        console.log(`  vs. 10 separate keys: $10/month`);
      });
    });
  });
});
