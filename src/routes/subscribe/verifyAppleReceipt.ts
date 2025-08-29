import fetch from 'node-fetch';

export interface AppleReceiptVerifyOptions {
  receiptData: string; // base64 receipt
  sharedSecret: string; // App-specific shared secret for auto-renewable subs
  excludeOldTransactions?: boolean;
}

export interface AppleLatestReceiptInfoItem {
  product_id: string;
  original_transaction_id: string;
  expires_date_ms?: string; // ms as string
  cancellation_date_ms?: string;
  purchase_date_ms?: string;
  is_in_billing_retry_period?: string; // '1' | '0'
  is_trial_period?: string; // '1' | '0'
  subscription_group_identifier?: string;
}

export interface AppleVerifyResponse {
  status: number; // 0 success
  environment?: string; // 'Sandbox' | 'Production'
  latest_receipt_info?: AppleLatestReceiptInfoItem[];
  receipt?: any;
  [k: string]: any;
}

const PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

export async function verifyAppleReceipt(opts: AppleReceiptVerifyOptions): Promise<AppleVerifyResponse> {
  const body = {
    'receipt-data': opts.receiptData,
    password: opts.sharedSecret,
    'exclude-old-transactions': opts.excludeOldTransactions !== false,
  };

  let resp = await post(PROD_URL, body);
  if (resp.status === 21007) {
    resp = await post(SANDBOX_URL, body);
  } else if (resp.status === 21008) {
    resp = await post(PROD_URL, body);
  }
  return resp;
}

async function post(url: string, body: any): Promise<AppleVerifyResponse> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`Apple verify HTTP ${r.status}`);
  }
  return (await r.json()) as AppleVerifyResponse;
}

export interface ParsedSubscription {
  productId: string;
  originalTransactionId: string;
  expiresAt: number; // ms since epoch
  isActive: boolean;
  isInBillingRetry?: boolean;
  raw?: AppleLatestReceiptInfoItem;
}

export function extractLatestForProducts(resp: AppleVerifyResponse, productIds: string[]): ParsedSubscription | null {
  if (!resp.latest_receipt_info || !Array.isArray(resp.latest_receipt_info)) return null;
  const target = resp.latest_receipt_info
    .filter(i => productIds.includes(i.product_id))
    .map(i => {
      const expiresAt = i.expires_date_ms ? parseInt(i.expires_date_ms, 10) : 0;
      return { item: i, expiresAt };
    })
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];
  if (!target) return null;
  const { item, expiresAt } = target;
  const now = Date.now();
  const isCanceled = !!item.cancellation_date_ms && parseInt(item.cancellation_date_ms, 10) <= expiresAt;
  const isActive = !isCanceled && expiresAt > now;
  return {
    productId: item.product_id,
    originalTransactionId: item.original_transaction_id,
    expiresAt,
    isActive,
    isInBillingRetry: item.is_in_billing_retry_period === '1',
    raw: item,
  };
}