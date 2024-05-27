// only to be used on a server component
import crypto from 'crypto';

export function base64Decode(data: string) {
  return Buffer.from(data, 'base64');
}

export function decryptData(base64Key: string, data: string) {
  try {
    const algorithm = 'aes-256-cbc';
    const inputEncoding = 'base64';
    const outputEncoding = 'utf8';

    const key = base64Decode(base64Key);
    const encryptedData = base64Decode(data);

    // Split IV and the encrypted text
    const iv = encryptedData.slice(0, 16); // AES.block_size of 16 bytes
    const ct = encryptedData.slice(16);

    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    // @ts-ignore
    let decrypted = decipher.update(ct, inputEncoding, outputEncoding);
    // @ts-ignore
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('Code non valid', err);
    return null;
  }
}
