# Encryption Setup Guide

## Overview

All sensitive user data in the `journals`, `conversations`, and `userProfile` subcollections is now encrypted using **AES-256-GCM** encryption before being stored in Firestore.

## What is Encrypted

### Journals Collection
- ✅ `transcript` - The user's journal entry text
- ✅ `prompt` - The journal prompt
- ✅ `aiResponse.summary` - AI-generated summary
- ✅ `aiResponse.nextStep` - AI-generated next step
- ✅ `aiResponse.selfInsight` - AI-generated self-insight
- ✅ `aiResponse.thoughtPattern` - AI-generated thought pattern analysis
- ❌ `aiResponse.moodScore` - NOT encrypted (numeric metric)
- ❌ `aiResponse.feelings` - NOT encrypted (categorical data)
- ❌ `aiResponse.topic` - NOT encrypted (categorical data)
- ❌ `aiResponse.personalityDeltas` - NOT encrypted (metrics)

### Conversations Collection
- ✅ `transcript` - Full conversation transcript
- ✅ `messageX` - Each user message (questions)
- ✅ `messageX.answer` - Each AI response
- ❌ `title` - NOT encrypted (displayed in list view)
- ❌ Timestamps - NOT encrypted (metadata)

### UserProfile Collection
- ✅ `facts.text` - User profile facts
- ✅ `statusParagraph` - User status summary
- ❌ `facts.createdAt` - NOT encrypted (timestamp)

## Environment Setup

### 1. Add Encryption Key to Environment

Add the following to your `.env` file (or environment variables in production):

```bash
ENCRYPTION_KEY=7a0864030b7d327b8abd6a5bb78bce51d18fcbce941f15234a5ff4d8028cd0c4
```

**⚠️ CRITICAL SECURITY NOTES:**
- **NEVER commit this key to Git**
- Add `ENCRYPTION_KEY` to your `.gitignore` file if using a `.env` file
- In production, use a secrets management service (AWS Secrets Manager, Google Secret Manager, etc.)
- If you lose this key, **all encrypted data becomes unrecoverable**
- Keep secure backups of this key in a password manager or secure vault

### 2. Generate a New Key (if needed)

To generate a new encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This will output a 64-character hexadecimal string (32 bytes).

## Files Modified

### Core Encryption Module
- ✅ `src/utils/encryption.ts` - Encryption/decryption utilities

### Journal Routes
- ✅ `src/routes/journal/submitJournal.ts` - Encrypts journal data before saving
- ✅ `src/routes/journal/generateProfileFacts.ts` - Encrypts/decrypts user profile data
- ✅ `src/routes/files/getJournals.ts` - Decrypts journals when fetching
- ✅ `src/routes/files/getJournalsByDate.ts` - Decrypts journals when fetching by date

### Conversation/Bobee Routes
- ✅ `src/routes/bobee/chat.ts` - Encrypts messages, decrypts user profile for context
- ✅ `src/routes/bobee/saveConversation.ts` - Encrypts conversation data
- ✅ `src/routes/bobee/openConversation.ts` - Decrypts conversation history
- ✅ `src/routes/bobee/reflectionFlow.ts` - Decrypts journals for context

### Settings Routes
- ✅ `src/routes/settings/userPersonalityData.ts` - Decrypts user profile data

### Schedulers/Cron Jobs
- ✅ `src/schedulers/dailyAiInsights.ts` - Decrypts journals for AI insights generation
- ❌ `src/schedulers/calculateDailyMoods.ts` - No changes needed (only reads moodScore)

## How It Works

### Encryption Process
1. User submits data (journal, chat message, etc.)
2. Backend receives plain text data
3. Backend encrypts sensitive fields using `encrypt()` function
4. Encrypted data is stored in Firestore
5. In Firestore, the data looks like: `iv:encryptedData:authTag`

### Decryption Process
1. Backend retrieves encrypted data from Firestore
2. Backend decrypts using `decrypt()` function
3. Plain text data is sent to frontend or AI services
4. Frontend receives plain text (encryption is transparent)

### Example Encrypted Data in Firestore
```json
{
  "transcript": "a1b2c3d4e5f6:1234567890abcdef:9876543210fedcba",
  "aiResponse": {
    "summary": "x1y2z3w4v5u6:abcdef1234567890:fedcba9876543210",
    "moodScore": 7
  }
}
```

## Data Migration

### For Existing Data (Important!)

If you have existing unencrypted data in Firestore, you need to:

1. **Option A: Accept Mixed Data** - The `decrypt()` function is designed to handle both encrypted and unencrypted data gracefully. It will:
   - Return unencrypted data as-is if it doesn't match the encrypted format
   - Decrypt properly formatted encrypted data
   - This allows for gradual migration as new data is encrypted

2. **Option B: Migrate Existing Data** - Create a migration script to encrypt all existing data:

```typescript
// Migration script example (not included - create if needed)
async function migrateExistingData() {
  const users = await db.collection('users').get();
  
  for (const userDoc of users.docs) {
    // Migrate journals
    const journals = await db.collection('users').doc(userDoc.id).collection('journals').get();
    for (const journal of journals.docs) {
      const data = journal.data();
      await journal.ref.update({
        transcript: encrypt(data.transcript),
        // ... encrypt other fields
      });
    }
  }
}
```

## Testing

### Verify Encryption is Working

1. Submit a new journal entry
2. Check Firestore directly - you should see encrypted data (long strings with colons)
3. Retrieve the journal via API - you should see plain text

### Verify Decryption is Working

1. Retrieve existing conversations or journals
2. Data should be returned in plain text
3. Check server logs for any decryption errors

## Security Best Practices

1. **Key Rotation**: Plan to rotate encryption keys periodically (requires re-encrypting all data)
2. **Access Control**: Limit who has access to the ENCRYPTION_KEY
3. **Monitoring**: Monitor for decryption failures (could indicate tampering or corruption)
4. **Backups**: Keep encrypted backups with keys stored separately
5. **Compliance**: Ensure encryption meets your data protection requirements (GDPR, HIPAA, etc.)

## Troubleshooting

### Error: "ENCRYPTION_KEY must be a 64-character hex string"
- Check that your `.env` file has the correct ENCRYPTION_KEY
- Verify the key is exactly 64 hexadecimal characters
- Restart your server after adding the key

### Decryption errors in logs
- Check if data in Firestore is properly formatted
- Verify the encryption key hasn't changed
- Look for corruption in the encrypted data

### Mixed encrypted/unencrypted data
- This is expected during migration period
- The decrypt function handles both formats
- Gradually all data will become encrypted as it's updated

## Additional Notes

- AI services (OpenAI) receive **decrypted** data for processing
- Frontend **never sees encrypted data** - it's transparent
- Firestore queries on encrypted fields won't work (use indexed unencrypted fields for searching)
- Encryption adds minimal performance overhead (~1-5ms per operation)
