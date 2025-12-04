# Amplify Gen2 + Lambda統合

Next.jsの実行ロールに権限を付与する代わりに、Lambda関数に切り出すアーキテクチャ。

## アーキテクチャ

```
Next.js (SSR)
  ↓ (Function URL or API Gateway)
Lambda (KMS権限あり)
  ↓
AWS KMS
```

## メリット

1. **権限管理が簡単** - backend.tsで完結
2. **セキュリティ** - Next.jsにKMS権限不要
3. **最小権限** - Lambdaのみがアクセス可能
4. **監査** - CloudWatch Logsで追跡

## 構成

```
amplify/
  backend.ts                           # Lambda定義 + KMS権限付与
  functions/
    create-wallet/
      handler.ts                       # ウォレット作成
      package.json
    sign-message/
      handler.ts                       # メッセージ署名
      package.json
    sign-transaction/
      handler.ts                       # トランザクション署名
      package.json
```

## セットアップ

### 1. ファイルをコピー

```bash
# このディレクトリの内容をプロジェクトにコピー
cp -r amplify-lambda/* your-project/amplify/
```

### 2. backend.tsを置き換え

```bash
cp amplify-lambda/backend.ts your-project/amplify/backend.ts
```

### 3. 依存関係をインストール

```bash
cd amplify/functions/create-wallet && npm install
cd ../sign-message && npm install
cd ../sign-transaction && npm install
```

### 4. Amplify Sandboxを起動

```bash
npx ampx sandbox
```

これで自動的に：
- Lambda関数が作成される
- KMS権限が付与される
- Function URLsが生成される

### 5. Next.jsから呼び出す

Function URLsを環境変数に設定：

```bash
# .env.local
CREATE_WALLET_FUNCTION_URL=https://xxx.lambda-url.ap-northeast-1.on.aws/
SIGN_MESSAGE_FUNCTION_URL=https://yyy.lambda-url.ap-northeast-1.on.aws/
SIGN_TRANSACTION_FUNCTION_URL=https://zzz.lambda-url.ap-northeast-1.on.aws/
```

Next.js API Route:

```typescript
// app/api/wallet/create/route.ts
const response = await fetch(process.env.CREATE_WALLET_FUNCTION_URL!, {
  method: 'POST',
  body: JSON.stringify({ userId })
});
```

## 認証

### 開発環境

Function URL authType: `NONE` (backend.tsで設定済み)

### 本番環境

1. **AWS_IAM認証を使用**

```typescript
// backend.ts
authType: 'AWS_IAM'
```

2. **Next.jsから署名付きリクエスト**

```typescript
import { SignatureV4 } from '@aws-sdk/signature-v4';

// IAM署名付きリクエスト
const signedRequest = await signRequest(functionUrl, body);
```

3. **または、API Gatewayを追加**

```typescript
// backend.ts
import { defineHttpApi } from '@aws-amplify/backend';

const api = defineHttpApi({
  routes: {
    'POST /wallet/create': createWallet,
    'POST /wallet/sign-message': signMessage,
  }
});
```

## DB統合例

Lambda関数内でDynamoDBに保存：

```typescript
// functions/create-wallet/handler.ts
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDBClient({});

await dynamodb.send(new PutItemCommand({
  TableName: process.env.WALLETS_TABLE,
  Item: {
    userId: { S: event.userId },
    kmsKeyId: { S: keyId },
    ethereumAddress: { S: address },
  }
}));
```

backend.tsでテーブルを定義：

```typescript
import { defineData } from '@aws-amplify/backend';

const data = defineData({
  schema: /* GraphQL schema */
});

const backend = defineBackend({
  data,
  createWallet,
  // ...
});

// Lambdaにテーブルアクセス権限を付与
data.resources.tables['UserWallet'].grantReadWriteData(createWallet.resources.lambda);
```

## コスト

- Lambda: 100万リクエスト/月まで無料
- Function URLs: 追加料金なし
- KMS: 署名 $0.03/10,000回
- DynamoDB: オンデマンドで$1.25/100万リクエスト

**月1万ユーザーで約$15/月**

## トラブルシューティング

### Lambda timeout

```typescript
// backend.ts
defineFunction({
  timeout: Duration.seconds(30), // デフォルトは3秒
});
```

### Function URLにアクセスできない

1. authType: 'NONE'に設定
2. CORSを確認
3. CloudWatch Logsを確認

### KMS権限エラー

backend.tsのkmsPolicy.resourcesを確認
