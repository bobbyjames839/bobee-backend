# bobee-backend

## Subscription (Apple IAP) Flow (Aug 2025)

Minimal persistence approach:

1. Client purchases via `react-native-iap` and sends Base64 receipt to `POST /api/subscribe/iap/verify`.
2. Server verifies with Apple and stores a cached entitlement under `users/{uid}.entitlement`.
3. Reverse mapping stored at `appleEntitlements/{originalTransactionId}` -> `{ uid, productId, lastSeen }` to prevent receipt replay across accounts.
4. Client fetches current status from `GET /api/subscribe/unified-status` which derives activity from `entitlement.expiresAt`.

No Firestore-driven subscription state is required beyond the cached entitlement + OTID mapping.

To deprecate later:
- (Legacy `subscribe.subscribed` removed.)

Potential future enhancements:
- Add Apple Server-to-Server Notifications endpoint to refresh entitlement automatically.
- Scheduled job to prune stale `appleEntitlements` docs.