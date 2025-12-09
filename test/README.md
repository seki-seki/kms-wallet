# KMS Wallet Tests

KMS Walletの動作確認とBDD形式の使い方説明テスト

## 特徴

- **BDD形式**: テストコード自体が使い方のドキュメントになっています
- **Ganache自動起動**: テスト実行時に自動的にGanacheノードを起動・停止
- **段階的テスト**: AWS KMSなしでも基本動作を確認できます

## 前提条件

- Node.js 18以上
- npm

## セットアップ

```bash
npm install
```

## テスト実行方法

### 1. 基本テスト（AWS KMSなし）

```bash
npm test
```

AWS KMSがなくても、以下のテストが実行されます：
- シンプルなウォレット統合のモックテスト
- 基本的なEthereumトランザクションのフロー

### 2. AWS KMSを使ったテスト

AWS KMSキーがある場合、実際の機能テストを実行できます：

```bash
# KMSキーIDを環境変数に設定
export KMS_KEY_ID=your-kms-key-id

# テスト実行
npm test
```

### 3. KMS Keyの作成テスト

新しいKMSキーを実際に作成するテスト（注意：AWSリソースが作成されます）：

```bash
export TEST_KMS_CREATE=true
npm test
```

## テスト構成

### KmsWallet (AWS KMS使用時)

#### 基本的な使い方
```typescript
describe('基本的な使い方', () => {
  it('KmsWalletインスタンスを作成できる', async () => {
    const wallet = new KmsWallet({
      keyId: KMS_KEY_ID,
    });
  });

  it('Ethereumアドレスを取得できる', async () => {
    const wallet = new KmsWallet({ keyId: KMS_KEY_ID });
    const address = await wallet.getAddress();
    // 0x... 形式のアドレスが取得できる
  });

  it('公開鍵を取得できる', async () => {
    const wallet = new KmsWallet({ keyId: KMS_KEY_ID });
    const publicKey = await wallet.getPublicKey();
    // 65バイトの非圧縮公開鍵
  });
});
```

#### メッセージ署名
```typescript
describe('メッセージ署名', () => {
  it('文字列メッセージに署名できる', async () => {
    const wallet = new KmsWallet({ keyId: KMS_KEY_ID });
    const signature = await wallet.personalSign('Hello, Ethereum!');
    // 0x... 形式の署名が取得できる
  });

  it('署名を検証できる', async () => {
    const wallet = new KmsWallet({ keyId: KMS_KEY_ID });
    const message = 'Test message';
    const signature = await wallet.personalSign(message);
    const address = await wallet.getAddress();

    const recoveredAddress = ethers.verifyMessage(message, signature);
    // 署名から元のアドレスを復元できる
  });
});
```

#### トランザクション署名
```typescript
describe('トランザクション署名', () => {
  it('トランザクションに署名できる', async () => {
    const wallet = new KmsWallet({ keyId: KMS_KEY_ID });
    const signedTx = await wallet.signTransaction({
      to: '0x...',
      value: ethers.parseEther('0.1'),
      gasLimit: 21000,
      gasPrice: feeData.gasPrice,
      nonce: 0,
      chainId: 1337,
    });
    // 署名済みトランザクションの16進数文字列
  });

  it('署名されたトランザクションを検証できる', async () => {
    const wallet = new KmsWallet({ keyId: KMS_KEY_ID });
    const signedTx = await wallet.signTransaction({...});
    const parsedTx = ethers.Transaction.from(signedTx);
    // トランザクションのfromアドレスを検証できる
  });
});
```

#### KMS Keyの作成
```typescript
describe('KMS Keyの作成', () => {
  it('KmsWallet.create()で新しいウォレットを作成できる', async () => {
    const { wallet, keyId, address, publicKey } = await KmsWallet.create({
      description: 'Wallet for user alice',
      tags: {
        UserId: 'alice',
        Environment: 'production'
      }
    });
    // 新しいKMSキーとウォレットが作成される
  });
});
```

### KmsWalletProvider

#### 基本的な使い方
```typescript
describe('基本的な使い方', () => {
  it('KmsWalletProviderインスタンスを作成できる', async () => {
    const kmsWallet = new KmsWallet({ keyId: KMS_KEY_ID });
    const provider = new ethers.JsonRpcProvider('...');

    const kmsProvider = new KmsWalletProvider({
      kmsWallet,
      provider,
    });
    // ethers.jsのProviderとして使用可能
  });

  it('アドレスを取得できる', async () => {
    const address = await kmsProvider.getAddress();
  });

  it('残高を取得できる', async () => {
    const balance = await kmsProvider.getBalance(address);
  });
});
```

#### トランザクション送信
```typescript
describe('トランザクション送信', () => {
  it('トランザクションを送信できる', async () => {
    const kmsProvider = new KmsWalletProvider({...});

    const tx = await kmsProvider.sendTransaction({
      to: recipient,
      value: ethers.parseEther('0.1'),
    });
    // KMSで自動的に署名されて送信される

    const receipt = await tx.wait();
    // トランザクション確認を待つ
  });

  it('複数のトランザクションを順次送信できる', async () => {
    for (let i = 0; i < 3; i++) {
      const tx = await kmsProvider.sendTransaction({...});
      await tx.wait();
    }
    // nonceは自動的に管理される
  });
});
```

#### メッセージ署名
```typescript
describe('メッセージ署名', () => {
  it('メッセージに署名できる', async () => {
    const signature = await kmsProvider.signMessage('Sign this message');
  });

  it('署名を検証できる', async () => {
    const signature = await kmsProvider.signMessage(message);
    const recoveredAddress = ethers.verifyMessage(message, signature);
    // 署名の検証
  });
});
```

#### Provider機能
```typescript
describe('Provider機能', () => {
  it('ブロック番号を取得できる', async () => {
    const blockNumber = await kmsProvider.getBlockNumber();
  });

  it('ネットワーク情報を取得できる', async () => {
    const network = await kmsProvider.getNetwork();
  });

  it('ガス価格を取得できる', async () => {
    const feeData = await kmsProvider.getFeeData();
  });
});
```

### 使用例

#### シンプルなウォレット統合
```typescript
it('通常のethers.Walletと同様に使用できる', async () => {
  // 1. ウォレット作成
  const wallet = ethers.Wallet.createRandom().connect(provider);

  // 2. アドレス取得
  const address = wallet.address;

  // 3. 残高確認
  const balance = await provider.getBalance(address);

  // 4. トランザクション送信
  const tx = await wallet.sendTransaction({
    to: recipient,
    value: ethers.parseEther('0.1'),
  });
  await tx.wait();

  // 5. メッセージ署名
  const signature = await wallet.signMessage('Hello!');

  // 6. 署名検証
  const recoveredAddress = ethers.verifyMessage(message, signature);
});
```

## 出力例

### AWS KMSなし（基本テスト）

```
KMS Wallet
  使用例
    シンプルなウォレット統合
      ✓ 通常のethers.Walletと同様に使用できる（モック） (250ms)
        Wallet address: 0x742d35cc6634c0532925a3b844bc9e7595f0beb0
        Balance: 1.0 ETH
        ✓ Transaction confirmed: 0x123...
        ✓ Message signature verified

Test Suites: 1 passed, 1 total
Tests:       13 skipped, 1 passed, 14 total
```

### AWS KMS使用時

```
KMS Wallet
  KmsWallet (AWS KMS使用時)
    基本的な使い方
      ✓ KmsWalletインスタンスを作成できる
      ✓ Ethereumアドレスを取得できる (1250ms)
        Ethereum address: 0x742d35cc6634c0532925a3b844bc9e7595f0beb0
      ✓ 公開鍵を取得できる (980ms)
        Public key length: 65 bytes
    メッセージ署名
      ✓ 文字列メッセージに署名できる (1100ms)
        Signature: 0x1234abcd...
      ✓ 署名を検証できる (1200ms)
        ✓ Signature verified for address: 0x742d...
    トランザクション署名
      ✓ トランザクションに署名できる (1300ms)
        ✓ Transaction signed: 0xabcd1234...
      ✓ 署名されたトランザクションを検証できる (1250ms)
        ✓ Transaction from: 0x742d...
  KmsWalletProvider
    基本的な使い方
      ✓ KmsWalletProviderインスタンスを作成できる
      ✓ アドレスを取得できる (1100ms)
        KmsWalletProvider address: 0x742d...
      ✓ 残高を取得できる (50ms)
        Balance: 0.0 ETH
    トランザクション送信
      ✓ トランザクションを送信できる (2500ms)
        ✓ Transaction sent: 0xabcd...
        ✓ Transaction confirmed in block 123
      ✓ 複数のトランザクションを順次送信できる (7200ms)
        ✓ Transaction 1/3: 0x1234...
        ✓ Transaction 2/3: 0x5678...
        ✓ Transaction 3/3: 0x9abc...

Test Suites: 1 passed, 1 total
Tests:       1 skipped, 13 passed, 14 total
```

## テストから学べること

### 1. KmsWalletの初期化
```typescript
const wallet = new KmsWallet({
  keyId: 'your-kms-key-id',
  region: 'us-east-1', // オプション
});
```

### 2. アドレスと公開鍵の取得
```typescript
const address = await wallet.getAddress();
const publicKey = await wallet.getPublicKey();
```

### 3. メッセージ署名
```typescript
const signature = await wallet.personalSign('Hello, Ethereum!');
const recoveredAddress = ethers.verifyMessage('Hello, Ethereum!', signature);
```

### 4. トランザクション署名
```typescript
const signedTx = await wallet.signTransaction({
  to: '0x...',
  value: ethers.parseEther('0.1'),
  gasLimit: 21000,
  gasPrice: feeData.gasPrice,
  nonce: 0,
  chainId: 1,
});

// ブロードキャスト
const tx = await provider.broadcastTransaction(signedTx);
await tx.wait();
```

### 5. KmsWalletProviderの使用
```typescript
const kmsWallet = new KmsWallet({ keyId: KMS_KEY_ID });
const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/...');

const kmsProvider = new KmsWalletProvider({
  kmsWallet,
  provider,
});

// 通常のProviderとして使用
const tx = await kmsProvider.sendTransaction({
  to: '0x...',
  value: ethers.parseEther('0.1'),
});
await tx.wait();
```

## トラブルシューティング

### AWS KMSテストがスキップされる

これは正常です。`KMS_KEY_ID`環境変数が設定されていない場合、AWS KMS関連のテストは自動的にスキップされます。

### KMS署名が遅い

AWS KMSの署名は通常1〜2秒かかります。これは正常な動作です。

### KMSテストでエラー

- AWS認証情報が正しく設定されているか確認
- KMSキーが`ECC_SECG_P256K1`で作成されているか確認
- リージョンが正しいか確認

## 利点

### BDD形式のテスト

- **テストがドキュメント**: テストコードを読むだけで使い方がわかる
- **実行可能な例**: すべてのコード例が実際に動作する
- **段階的学習**: 簡単な例から複雑な例まで順序立てて学べる

### 自動テスト

- `npm test`だけで完結
- CIで簡単に実行可能
- Ganacheが自動起動・停止

### 実用的

- 実際のユースケースに基づいたテスト
- プロダクションコードの参考になる
