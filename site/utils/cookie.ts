import 'server-only';

import { cookies } from 'next/headers';
import { getAnHourFromNow } from './date';
import { decryptAuthenticated, encryptAuthenticated } from '@/utils/decryption';
import { fromBase64ToString } from '@/utils/string';
import { ConfirmPayload, SearchPayload } from '@/types/EligibilityTest';
import { AUTHORIZED_VENDORS_KEY } from '@/app/constants/cookie-manager';

const COOKIE_SUPPORT_KEY = process.env.NEXT_PUBLIC_COOKIE_SUPPORT_KEY as string;
const BASE_64_KEY_FOR_SUPPORT_COOKIE = process.env.BASE_64_KEY_FOR_SUPPORT_COOKIE as string;

const MAX_ATTEMPTS = 3;

// User input only, never LCA's answer (see the verdict route)
export type SupportAttempt = SearchPayload &
  Omit<Partial<ConfirmPayload>, 'id' | 'situation' | 'organisme'> & { recipientEmail: string };

export interface SupportData {
  attempts: SupportAttempt[];
  franceConnect: SupportFranceConnect | null;
}

// Identity fields are dropped on FranceConnect logout, only the visit dates are kept
export interface SupportFranceConnect {
  allocataire_fc_sub?: string;
  recipientLastname?: string;
  recipientFirstname?: string;
  recipientBirthDate?: string;
  connectedAt: string;
  disconnectedAt?: string;
}

async function handleSupportCookie(payload: SupportAttempt) {
  if (!(await hasGivenConsentForSupportCookie())) {
    await removeSupportCookie();
    return;
  }

  const { attempts, franceConnect } = await getDecryptedSupportCookie();

  await setSupportCookie(
    encryptSupportPayload({
      attempts: [...attempts, payload].slice(-MAX_ATTEMPTS),
      franceConnect,
    }),
  );
}

async function markFranceConnectInSupportCookie(
  franceConnect: Omit<SupportFranceConnect, 'connectedAt' | 'disconnectedAt'>,
) {
  if (!(await hasGivenConsentForSupportCookie())) {
    return;
  }

  const { attempts } = await getDecryptedSupportCookie();

  await setSupportCookie(
    encryptSupportPayload({
      attempts,
      franceConnect: { ...franceConnect, connectedAt: new Date().toISOString() },
    }),
  );
}

// Shared devices: the next person using the browser must not send this identity to support
async function clearFranceConnectIdentityFromSupportCookie() {
  const { attempts, franceConnect } = await getDecryptedSupportCookie();

  if (!franceConnect) {
    return;
  }

  if (!(await hasGivenConsentForSupportCookie())) {
    await removeSupportCookie();
    return;
  }

  await setSupportCookie(
    encryptSupportPayload({
      attempts,
      franceConnect: {
        connectedAt: franceConnect.connectedAt,
        disconnectedAt: new Date().toISOString(),
      },
    }),
  );
}

async function hasGivenConsentForSupportCookie() {
  const cookieStore = await cookies();
  const consentCookie = cookieStore.get(AUTHORIZED_VENDORS_KEY)?.value;

  return consentCookie?.includes(`${COOKIE_SUPPORT_KEY}=true`);
}

function encryptSupportPayload(valueToEncrypt: SupportData) {
  return encryptAuthenticated(JSON.stringify(valueToEncrypt), BASE_64_KEY_FOR_SUPPORT_COOKIE);
}

// Null when the cookie is missing or cannot be decrypted/parsed. Legacy cookies (still alive
// for up to an hour) base64-encode the JSON before encryption, and the oldest ones hold a bare
// array of attempts.
function decodeSupportCookie(encryptedValue: string | undefined): SupportData | null {
  if (typeof encryptedValue !== 'string') {
    return null;
  }

  const decryptedValue = decryptAuthenticated(encryptedValue, BASE_64_KEY_FOR_SUPPORT_COOKIE);

  if (typeof decryptedValue !== 'string') {
    return null;
  }

  try {
    const isPlainJson = decryptedValue.startsWith('{') || decryptedValue.startsWith('[');
    const parsed = JSON.parse(isPlainJson ? decryptedValue : fromBase64ToString(decryptedValue));

    if (Array.isArray(parsed)) {
      return { attempts: parsed, franceConnect: null };
    }

    return {
      attempts: Array.isArray(parsed?.attempts) ? parsed.attempts : [],
      franceConnect: parsed?.franceConnect ?? null,
    };
  } catch {
    return null;
  }
}

async function getDecryptedSupportCookie(): Promise<SupportData> {
  const cookieStore = await cookies();

  return (
    decodeSupportCookie(cookieStore.get(COOKIE_SUPPORT_KEY)?.value) ?? {
      attempts: [],
      franceConnect: null,
    }
  );
}

async function setSupportCookie(encryptedPayload: string) {
  const oneHourFromNow = getAnHourFromNow();
  const cookieStore = await cookies();

  return cookieStore.set(COOKIE_SUPPORT_KEY, encryptedPayload, {
    secure: true,
    httpOnly: true,
    expires: oneHourFromNow,
    // Lax, not strict: the FranceConnect callback is a cross-site redirect and must read the
    // existing attempts before adding the FranceConnect marker.
    sameSite: 'lax',
  });
}

async function removeSupportCookie() {
  const cookieStore = await cookies();
  return cookieStore.delete(COOKIE_SUPPORT_KEY);
}

export {
  clearFranceConnectIdentityFromSupportCookie,
  decodeSupportCookie,
  handleSupportCookie,
  markFranceConnectInSupportCookie,
};
