import { ConfirmResponseBody } from 'types/EligibilityTest';
import { buildQRCodeUrl, buildQuery, encrypt } from './qr-code';

import { decryptData } from '../../../utils/decryption';
import { buildConfirmResponseBody } from '../../../tests/helpers/builders/confirm-response-body';

describe('qr-code units tests', () => {
  describe('buildQuery()', () => {
    it('builds a query string from eligible data', () => {
      const eligible: ConfirmResponseBody = buildConfirmResponseBody({});

      expect(buildQuery(eligible)).toEqual(
        'bp=Manon&bn=Dupond&bg=F&bdn=01%2F01%2F2011&c=24-IIII-IIII',
      );
    });
  });

  describe('encrypt()', () => {
    const textToEncode = 'bp=Manon&bn=Dupond&bg=F&bdn=01%2F01%2F2011&c=24-IIII-IIII';
    const encrypted = encrypt(textToEncode);
    const decrypted = decryptData(process.env.BASE_64_KEY!, encrypted);
    expect(decrypted).toEqual(textToEncode);
  });

  describe('buildQRCodeUrl()', () => {
    it('returns an empty string when secret is missing', () => {
      const savedSecret = process.env.BASE_64_KEY;
      delete process.env.BASE_64_KEY;
      const eligible: ConfirmResponseBody = buildConfirmResponseBody({});

      const qrCodeUrl = buildQRCodeUrl(eligible);
      expect(qrCodeUrl).toEqual('');
      process.env.BASE_64_KEY = savedSecret;
    });

    it('encode relevant eligible data', () => {
      const eligible: ConfirmResponseBody = buildConfirmResponseBody({});

      const qrCodeUrl = buildQRCodeUrl(eligible);
      expect(qrCodeUrl).not.toEqual(''); // since iV changes all the time, the encrypted segment of the url is unpredicable
    });
  });
});
