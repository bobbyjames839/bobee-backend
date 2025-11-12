import crypto from 'crypto';

// Get encryption key from environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'hex');

/**
 * Encrypts a string using AES-256-GCM
 * Returns format: iv:encrypted:authTag (all in hex)
 */
export function encrypt(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  // Generate a random initialization vector (IV)
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUFFER, iv);
  
  // Encrypt the text
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine IV + encrypted data + auth tag
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * Decrypts a string encrypted with the encrypt function
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData || typeof encryptedData !== 'string') return encryptedData;
  
  // If it doesn't look like encrypted data (no colons), return as-is
  // This handles cases where data might not be encrypted yet
  if (!encryptedData.includes(':')) {
    return encryptedData;
  }
  
  try {
    // Split the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      console.warn('Invalid encrypted data format, returning as-is');
      return encryptedData;
    }
    
    const [ivHex, encrypted, authTagHex] = parts;
    
    // Convert from hex
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUFFER, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    // Return encrypted data if decryption fails (backwards compatibility)
    return encryptedData;
  }
}

/**
 * Encrypts specific fields in an object
 */
export function encryptFields<T extends Record<string, any>>(
  obj: T,
  fieldsToEncrypt: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fieldsToEncrypt) {
    if (result[field] != null && typeof result[field] === 'string') {
      result[field] = encrypt(result[field] as string) as T[keyof T];
    }
  }
  return result;
}

/**
 * Decrypts specific fields in an object
 */
export function decryptFields<T extends Record<string, any>>(
  obj: T,
  fieldsToDecrypt: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fieldsToDecrypt) {
    if (result[field] != null && typeof result[field] === 'string') {
      try {
        result[field] = decrypt(result[field] as string) as T[keyof T];
      } catch (error) {
        console.error(`Failed to decrypt field ${String(field)}:`, error);
        // Leave as-is if decryption fails
      }
    }
  }
  return result;
}

/**
 * Recursively encrypts string values in a nested object
 */
export function encryptObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return encrypt(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => encryptObject(item));
  }
  
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = encryptObject(obj[key]);
      }
    }
    return result;
  }
  
  return obj;
}

/**
 * Recursively decrypts string values in a nested object
 */
export function decryptObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return decrypt(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => decryptObject(item));
  }
  
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = decryptObject(obj[key]);
      }
    }
    return result;
  }
  
  return obj;
}
