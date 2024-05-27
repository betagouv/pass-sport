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
    const secret = btoa('0123456789ABCDEF0123456789ABCDEF');
    const encrypted = encrypt(textToEncode, secret);
    const decrypted = decryptData(encrypted, secret);

    expect(decrypted).toEqual(textToEncode);
  });

  describe('buildQRCodeUrl()', () => {
    it('returns an empty string when secret is missing', () => {
      const eligible: ConfirmResponseBody = buildConfirmResponseBody({});

      const qrCodeUrl = buildQRCodeUrl(eligible);
      expect(qrCodeUrl).toEqual('');
    });

    it('returns an empty string when baseUrl is missing', () => {
      const baseUrl = process.env.QR_CODE_BASE_URL;
      delete process.env.QR_CODE_BASE_URL;
      const eligible: ConfirmResponseBody = buildConfirmResponseBody({});

      const qrCodeUrl = buildQRCodeUrl(eligible);
      expect(qrCodeUrl).toEqual('');

      process.env.QR_CODE_BASE_URL = baseUrl;
    });

    it('encode relevant eligible data', () => {
      const eligible: ConfirmResponseBody = buildConfirmResponseBody({});
      const secret = btoa('0123456789ABCDEF0123456789ABCDEF');
      process.env.BASE_64_KEY = secret;

      const qrCodeUrl = buildQRCodeUrl(eligible);
      expect(qrCodeUrl).not.toEqual(''); // since iV changes all the time, the encrypted segment of the url is unpredicable

      delete process.env.BASE_64_KEY;
    });
  });
});
