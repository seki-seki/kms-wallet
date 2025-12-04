// app/api/wallet/create/route.ts
// Next.js側からLambdaを呼び出す例

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { userId } = await request.json();

  try {
    // Amplify Function URLを使って呼び出し
    const functionUrl = process.env.CREATE_WALLET_FUNCTION_URL!;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    // DBに保存
    // await db.userWallet.create({
    //   data: {
    //     userId,
    //     kmsKeyId: data.keyId,
    //     ethereumAddress: data.address
    //   }
    // });

    return NextResponse.json({
      success: true,
      keyId: data.keyId,
      address: data.address,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to create wallet' },
      { status: 500 }
    );
  }
}

// または、Amplify Data clientを使う場合（推奨）
// import { generateClient } from 'aws-amplify/data';
//
// const client = generateClient();
// const result = await client.mutations.createWallet({ userId });
