"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAppleReceipt = verifyAppleReceipt;
exports.extractLatestForProducts = extractLatestForProducts;
const node_fetch_1 = __importDefault(require("node-fetch"));
const PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
async function verifyAppleReceipt(opts) {
    const body = {
        'receipt-data': opts.receiptData,
        password: opts.sharedSecret,
        'exclude-old-transactions': opts.excludeOldTransactions !== false,
    };
    let resp = await post(PROD_URL, body);
    if (resp.status === 21007) {
        resp = await post(SANDBOX_URL, body);
    }
    else if (resp.status === 21008) {
        resp = await post(PROD_URL, body);
    }
    return resp;
}
async function post(url, body) {
    const r = await (0, node_fetch_1.default)(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        throw new Error(`Apple verify HTTP ${r.status}`);
    }
    return (await r.json());
}
function extractLatestForProducts(resp, productIds) {
    if (!resp.latest_receipt_info || !Array.isArray(resp.latest_receipt_info))
        return null;
    const target = resp.latest_receipt_info
        .filter(i => productIds.includes(i.product_id))
        .map(i => {
        const expiresAt = i.expires_date_ms ? parseInt(i.expires_date_ms, 10) : 0;
        return { item: i, expiresAt };
    })
        .sort((a, b) => b.expiresAt - a.expiresAt)[0];
    if (!target)
        return null;
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
