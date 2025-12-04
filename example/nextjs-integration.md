# Next.js SSR Integration Guide

Next.jsのサーバーサイドで直接KMSを使う場合の実装ガイドです。

## 1. インストール

```bash
npm install kms-wallet ethers @aws-sdk/client-kms
```

## 2. API Route実装

### App Router (app/api/wallet/[userId]/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { KmsWallet } from 'kms-wallet';

// ユーザーIDからKMS Key IDを取得（DBやキャッシュから）
async function getUserKeyId(userId: string): Promise<string> {
  // TODO: DynamoDB/Prismaなどから取得
  // const user = await db.user.findUnique({ where: { id: userId } });
  // return user.kmsKeyId;

  // 開発時は環境変数から
  return process.env[`KMS_KEY_${userId.toUpperCase()}`] || '';
}

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const keyId = await getUserKeyId(params.userId);

    if (!keyId) {
      return NextResponse.json(
        { error: 'User wallet not found' },
        { status: 404 }
      );
    }

    const wallet = new KmsWallet({ keyId });
    const address = await wallet.getAddress();

    return NextResponse.json({ address });
  } catch (error) {
    console.error('Error getting wallet address:', error);
    return NextResponse.json(
      { error: 'Failed to get wallet address' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { message, transaction } = await request.json();
    const keyId = await getUserKeyId(params.userId);

    if (!keyId) {
      return NextResponse.json(
        { error: 'User wallet not found' },
        { status: 404 }
      );
    }

    const wallet = new KmsWallet({ keyId });

    if (message) {
      // personal_sign
      const signature = await wallet.personalSign(message);
      return NextResponse.json({ signature });
    }

    if (transaction) {
      // トランザクション署名
      const signedTx = await wallet.signTransaction(transaction);
      return NextResponse.json({ signedTx });
    }

    return NextResponse.json(
      { error: 'Either message or transaction is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error signing:', error);
    return NextResponse.json(
      { error: 'Failed to sign' },
      { status: 500 }
    );
  }
}
```

### Pages Router (pages/api/wallet/[userId].ts)

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { KmsWallet } from 'kms-wallet';

async function getUserKeyId(userId: string): Promise<string> {
  // TODO: DBから取得
  return process.env[`KMS_KEY_${userId.toUpperCase()}`] || '';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { userId } = req.query;

  if (typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const keyId = await getUserKeyId(userId);
  if (!keyId) {
    return res.status(404).json({ error: 'User wallet not found' });
  }

  const wallet = new KmsWallet({ keyId });

  try {
    if (req.method === 'GET') {
      const address = await wallet.getAddress();
      return res.status(200).json({ address });
    }

    if (req.method === 'POST') {
      const { message, transaction } = req.body;

      if (message) {
        const signature = await wallet.personalSign(message);
        return res.status(200).json({ signature });
      }

      if (transaction) {
        const signedTx = await wallet.signTransaction(transaction);
        return res.status(200).json({ signedTx });
      }

      return res.status(400).json({ error: 'Message or transaction required' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

## 3. クライアントサイドから呼び出し

```typescript
// components/WalletButton.tsx
'use client';

import { useState } from 'react';

export function WalletButton({ userId }: { userId: string }) {
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const getAddress = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wallet/${userId}`);
      const data = await res.json();
      setAddress(data.address);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const signMessage = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wallet/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello, Ethereum!' }),
      });
      const data = await res.json();
      console.log('Signature:', data.signature);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={getAddress} disabled={loading}>
        Get Address
      </button>
      {address && <p>Address: {address}</p>}
      <button onClick={signMessage} disabled={loading}>
        Sign Message
      </button>
    </div>
  );
}
```

## 4. AWS権限設定

### Vercelにデプロイする場合

1. AWS IAMユーザーを作成
2. 以下のポリシーを付与：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:GetPublicKey",
        "kms:Sign",
        "kms:DescribeKey"
      ],
      "Resource": [
        "arn:aws:kms:ap-northeast-1:YOUR_ACCOUNT_ID:key/*"
      ],
      "Condition": {
        "StringEquals": {
          "kms:ResourceTag/Purpose": "Ethereum-Wallet"
        }
      }
    }
  ]
}
```

3. Vercel環境変数に設定：
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION=ap-northeast-1`

### Amplify Hostingにデプロイする場合

```typescript
// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import * as iam from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({});

// Next.jsのサービスロールにKMS権限を付与
const kmsPolicy = new iam.PolicyStatement({
  actions: [
    'kms:GetPublicKey',
    'kms:Sign',
    'kms:DescribeKey',
  ],
  resources: ['*'], // 本番環境では特定のARNに制限
  conditions: {
    StringEquals: {
      'kms:ResourceTag/Purpose': 'Ethereum-Wallet',
    },
  },
});

// Amplify Hosting SSR用のサービスロールに追加
// Note: これはAmplifyが自動生成するロールに追加する必要があります
// 手動でIAMコンソールから追加するか、CDKで既存のロールを取得して追加
```

### ECS/Fargateにデプロイする場合

タスク実行ロールに同様のKMS権限を付与します。

## 5. セキュリティのベストプラクティス

### 権限を最小化

```json
{
  "Resource": "arn:aws:kms:ap-northeast-1:123456789012:key/specific-key-id"
}
```

### タグで制限

```json
{
  "Condition": {
    "StringEquals": {
      "kms:ResourceTag/Purpose": "Ethereum-Wallet",
      "kms:ResourceTag/Environment": "production"
    }
  }
}
```

### レート制限

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimitMap = new Map<string, number[]>();

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/wallet')) {
    const ip = request.ip ?? 'unknown';
    const now = Date.now();
    const windowMs = 60000; // 1分
    const maxRequests = 10;

    const requests = rateLimitMap.get(ip) || [];
    const recentRequests = requests.filter(time => now - time < windowMs);

    if (recentRequests.length >= maxRequests) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }

    recentRequests.push(now);
    rateLimitMap.set(ip, recentRequests);
  }

  return NextResponse.next();
}
```

### ユーザー認証

```typescript
import { auth } from '@/lib/auth'; // NextAuth等

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // session.user.idとrequest paramsのuserIdが一致するか確認
  const { userId } = params;
  if (session.user.id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ... KMS操作
}
```

## 6. 環境変数

```bash
# .env.local
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# 開発用（本番はDBから取得）
KMS_KEY_USER1=your-kms-key-id-1
KMS_KEY_USER2=your-kms-key-id-2
```

## トラブルシューティング

### KMS権限エラー

```
AccessDeniedException: User is not authorized to perform: kms:Sign
```

→ IAMロール/ユーザーにKMS権限を付与してください

### タイムアウト

Next.js API Routeのタイムアウトを延長：
```typescript
export const maxDuration = 30; // 30秒
```

### コールドスタート

Lambda環境でのコールドスタートを考慮し、タイムアウトを長めに設定してください。
