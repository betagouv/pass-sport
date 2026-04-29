import { NextApiRequest, NextApiResponse } from 'next';
import { decryptData } from '@/utils/decryption';
import { z } from 'zod';

const payloadSchema = z.object({
  encrypted: z.string(),
});

export type CodeApiResponse = {
  firstname: string;
  lastname: string;
  gender: string;
  birthDate: string;
  code: string;
  qrCodeValue: string;
};

export type CodeApiError = {
  error: boolean;
};

export default async function POST(
  req: NextApiRequest,
  res: NextApiResponse<CodeApiResponse | CodeApiError>,
) {
  if (!process.env.QR_CODE_BASE_URL) {
    throw new Error('QR_CODE_BASE_URL missing');
  }

  if (!process.env.BASE_64_KEY) {
    throw new Error('BASE_64_KEY missing');
  }

  const jsonBody = JSON.parse(req.body);
  const { encrypted } = payloadSchema.parse(jsonBody);

  const base64Key = process.env.BASE_64_KEY;
  const encryptedDecoded = decodeURIComponent(encrypted.replace(/\+/g, ' '));
  const decryptedParams = decryptData(encryptedDecoded, base64Key);

  if (decryptedParams === null) return res.status(500).json({ error: true });

  const searchParams = new URLSearchParams(decryptedParams);
  const replaceDoubleQuotes = (input: string | null) => input?.replaceAll(`''`, `'`) || input;

  const [firstname, lastname, gender, birthDate, code] = [
    replaceDoubleQuotes(searchParams.get('bp')),
    replaceDoubleQuotes(searchParams.get('bn')),
    searchParams.get('bg'),
    searchParams.get('bdn'),
    searchParams.get('c'),
  ];

  if (!firstname || !lastname || !gender || !birthDate || !code) {
    return res.status(500).json({ error: true });
  }

  const qrCodeValue = `${process.env.QR_CODE_BASE_URL}#${encrypted}`;

  return res.json({
    firstname,
    lastname,
    gender,
    birthDate,
    code,
    qrCodeValue,
  });
}
