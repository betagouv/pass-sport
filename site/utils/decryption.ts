// only to be used on a server component
import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';

export function base64Decode(data: string) {
  return Buffer.from(data, 'base64');
}

const GCM_ALGORITHM = 'aes-256-gcm';
const GCM_IV_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;

export function encryptAuthenticated(dataToEncrypt: string, base64Key: string): string {
  const key = base64Decode(base64Key);
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(dataToEncrypt, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptAuthenticated(base64Data: string, base64Key: string): string | null {
  try {
    const key = base64Decode(base64Key);
    const data = base64Decode(base64Data);

    const iv = data.subarray(0, GCM_IV_LENGTH);
    const authTag = data.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(GCM_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf8');
  } catch (err) {
    Sentry.withScope((scope) => {
      scope.captureException(err);
      scope.setLevel('error');
      scope.captureMessage('Erreur lors de la decryption du cookie de support');
    });
    return null;
  }
}
