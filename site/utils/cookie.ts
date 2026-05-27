'use server';

import { cookies } from 'next/headers';
import { getAnHourFromNow } from './date';
import { decryptData, encrypt } from '@/utils/decryption';
import { fromBase64ToString } from '@/utils/string';
import { ConfirmPayload, FormStep, SearchPayload } from '@/types/EligibilityTest';
import { AUTHORIZED_VENDORS_KEY } from '@/app/constants/cookie-manager';

const COOKIE_SUPPORT_KEY = process.env.NEXT_PUBLIC_COOKIE_SUPPORT_KEY as string;
const BASE_64_KEY_FOR_SUPPORT_COOKIE = process.env.BASE_64_KEY_FOR_SUPPORT_COOKIE as string;

const MAX_ATTEMPTS_PER_STEP = 5;

async function handleSupportCookie(payload: SearchPayload | ConfirmPayload, step: FormStep) {
  // Added await here because hasGivenConsentForSupportCookie is now async
  if (!(await hasGivenConsentForSupportCookie())) {
    await removeSupportCookie(); // Added await
    return;
  }

  const mappingStep: Record<FormStep, string> = {
    search: 'Première étape du formulaire',
    confirm: 'Étape finale du formulaire',
  };

  const supportCookiePayload = [
    ...(await getDecryptedSupportCookie()),
    { ...payload, step: mappingStep[step] },
  ].filter(Boolean);

  const searchStepPayloads = supportCookiePayload
    .filter(({ step }) => step === mappingStep.search)
    .slice(-MAX_ATTEMPTS_PER_STEP);

  const confirmStepPayloads = supportCookiePayload
    .filter(({ step }) => step === mappingStep.confirm)
    .slice(-MAX_ATTEMPTS_PER_STEP);

  const mergedPayloads = [...searchStepPayloads, ...confirmStepPayloads];
  const encryptedCookiePayload = encryptSupportPayload(mergedPayloads);

  await setSupportCookie(encryptedCookiePayload); // Added await
}

// Changed to async to await cookies()
async function hasGivenConsentForSupportCookie() {
  const cookieStore = await cookies();
  const consentCookie = cookieStore.get(AUTHORIZED_VENDORS_KEY)?.value;

  return consentCookie?.includes(`${COOKIE_SUPPORT_KEY}=true`);
}

function encryptSupportPayload(valueToEncrypt: object) {
  return encrypt(
    Buffer.from(JSON.stringify(valueToEncrypt), 'utf-8').toString('base64'),
    BASE_64_KEY_FOR_SUPPORT_COOKIE,
  );
}

async function getDecryptedSupportCookie() {
  const cookieStore = await cookies(); // Added await
  const supportCookie = cookieStore.get(COOKIE_SUPPORT_KEY);

  if (typeof supportCookie?.value === 'string') {
    const decryptedCookieValue = decryptData(supportCookie.value, BASE_64_KEY_FOR_SUPPORT_COOKIE);

    if (typeof decryptedCookieValue === 'string') {
      return JSON.parse(fromBase64ToString(decryptedCookieValue));
    }

    return [];
  }

  return [];
}

// Changed to async to await cookies()
async function setSupportCookie(encryptedPayload: string) {
  const oneHourFromNow = getAnHourFromNow();
  const cookieStore = await cookies();

  return cookieStore.set(COOKIE_SUPPORT_KEY, encryptedPayload, {
    secure: true,
    httpOnly: true,
    expires: oneHourFromNow,
    sameSite: 'strict',
  });
}

// Changed to async to await cookies()
async function removeSupportCookie() {
  const cookieStore = await cookies();
  return cookieStore.delete(COOKIE_SUPPORT_KEY);
}

export { handleSupportCookie, getDecryptedSupportCookie };
