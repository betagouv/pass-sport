import 'server-only';

import { cookies } from 'next/headers';
import { getAnHourFromNow } from './date';
import { decryptAuthenticated, encryptAuthenticated } from '@/utils/decryption';
import { fromBase64ToString } from '@/utils/string';
import { ConfirmPayload, FormStep, SearchPayload } from '@/types/EligibilityTest';
import { AUTHORIZED_VENDORS_KEY } from '@/app/constants/cookie-manager';

const COOKIE_SUPPORT_KEY = process.env.NEXT_PUBLIC_COOKIE_SUPPORT_KEY as string;
const BASE_64_KEY_FOR_SUPPORT_COOKIE = process.env.BASE_64_KEY_FOR_SUPPORT_COOKIE as string;

const MAX_ATTEMPTS_PER_STEP = 5;

export type SupportAttempt = Record<string, unknown> & { step?: string };

export interface SupportData {
  attempts: SupportAttempt[];
  franceConnect: { allocataire_fc_sub: string; connectedAt: string } | null;
}

async function handleSupportCookie(payload: SearchPayload | ConfirmPayload, step: FormStep) {
  if (!(await hasGivenConsentForSupportCookie())) {
    await removeSupportCookie();
    return;
  }

  const mappingStep: Record<FormStep, string> = {
    search: 'Première étape du formulaire',
    confirm: 'Étape finale du formulaire',
  };

  const { attempts, franceConnect } = await getDecryptedSupportCookie();
  const supportCookiePayload = [...attempts, { ...payload, step: mappingStep[step] }];

  const searchStepPayloads = supportCookiePayload
    .filter(({ step }) => step === mappingStep.search)
    .slice(-MAX_ATTEMPTS_PER_STEP);

  const confirmStepPayloads = supportCookiePayload
    .filter(({ step }) => step === mappingStep.confirm)
    .slice(-MAX_ATTEMPTS_PER_STEP);

  await setSupportCookie(
    encryptSupportPayload({
      attempts: [...searchStepPayloads, ...confirmStepPayloads],
      franceConnect,
    }),
  );
}

async function markFranceConnectInSupportCookie(sub: string) {
  if (!(await hasGivenConsentForSupportCookie())) {
    return;
  }

  const { attempts } = await getDecryptedSupportCookie();

  await setSupportCookie(
    encryptSupportPayload({
      attempts,
      franceConnect: { allocataire_fc_sub: sub, connectedAt: new Date().toISOString() },
    }),
  );
}

async function hasGivenConsentForSupportCookie() {
  const cookieStore = await cookies();
  const consentCookie = cookieStore.get(AUTHORIZED_VENDORS_KEY)?.value;

  return consentCookie?.includes(`${COOKIE_SUPPORT_KEY}=true`);
}

function encryptSupportPayload(valueToEncrypt: SupportData) {
  return encryptAuthenticated(
    Buffer.from(JSON.stringify(valueToEncrypt), 'utf-8').toString('base64'),
    BASE_64_KEY_FOR_SUPPORT_COOKIE,
  );
}

// Null when the cookie is missing or cannot be decrypted/parsed. Cookies written before the
// FranceConnect marker existed hold a bare array of attempts.
function decodeSupportCookie(encryptedValue: string | undefined): SupportData | null {
  if (typeof encryptedValue !== 'string') {
    return null;
  }

  const decryptedValue = decryptAuthenticated(encryptedValue, BASE_64_KEY_FOR_SUPPORT_COOKIE);

  if (typeof decryptedValue !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64ToString(decryptedValue));

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

export { decodeSupportCookie, handleSupportCookie, markFranceConnectInSupportCookie };
