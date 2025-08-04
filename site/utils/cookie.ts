'use server';

import { cookies } from 'next/headers';
import { getAnHourFromNow } from './date';
import { decryptData, encrypt } from '@/utils/decryption';
import { fromBase64ToString } from '@/utils/string';
import { ConfirmPayload, FormStep, SearchPayload } from '@/types/EligibilityTest';
import { AUTHORIZED_VENDORS_KEY } from '@/app/constants/cookie-manager';

const COOKIE_SUPPORT_KEY = process.env.NEXT_PUBLIC_COOKIE_SUPPORT_KEY as string;
const BASE_64_KEY_FOR_SUPPORT_COOKIE = process.env.BASE_64_KEY_FOR_SUPPORT_COOKIE as string;

// Max attempts stored for each step, due to cookie size limitation 4096 bytes
const MAX_ATTEMPTS_PER_STEP = 5;

async function handleSupportCookie(payload: SearchPayload | ConfirmPayload, step: FormStep) {
  if (!hasGivenConsentForSupportCookie()) {
    removeSupportCookie();
    return;
  }

  // Mapping for human-readable step (displayed on crisp notes)
  const mappingStep: Record<FormStep, string> = {
    search: 'Première étape du formulaire',
    confirm: 'Étape finale du formulaire',
  };

  const supportCookiePayload = [
    ...(await getDecryptedSupportCookie()),
    { ...payload, step: mappingStep[step] },
  ].filter(Boolean);

  // minus slice to take from the end, eg: -5 -> takes the last 5 attempts
  const searchStepPayloads = supportCookiePayload
    .filter(({ step }) => step === mappingStep.search)
    .slice(-MAX_ATTEMPTS_PER_STEP);

  const confirmStepPayloads = supportCookiePayload
    .filter(({ step }) => step === mappingStep.confirm)
    .slice(-MAX_ATTEMPTS_PER_STEP);

  const mergedPayloads = [...searchStepPayloads, ...confirmStepPayloads];
  const encryptedCookiePayload = encryptSupportPayload(mergedPayloads);

  setSupportCookie(encryptedCookiePayload);
}

function hasGivenConsentForSupportCookie() {
  const consentCookie = cookies().get(AUTHORIZED_VENDORS_KEY)?.value;

  return consentCookie?.includes(`${COOKIE_SUPPORT_KEY}=true`);
}

function encryptSupportPayload(valueToEncrypt: object) {
  return encrypt(
    Buffer.from(JSON.stringify(valueToEncrypt), 'utf-8').toString('base64'),
    BASE_64_KEY_FOR_SUPPORT_COOKIE,
  );
}

async function getDecryptedSupportCookie() {
  const supportCookie = cookies().get(COOKIE_SUPPORT_KEY);

  if (typeof supportCookie?.value === 'string') {
    const decryptedCookieValue = decryptData(supportCookie.value, BASE_64_KEY_FOR_SUPPORT_COOKIE);

    if (typeof decryptedCookieValue === 'string') {
      return JSON.parse(fromBase64ToString(decryptedCookieValue));
    }

    return [];
  }

  return [];
}

function setSupportCookie(encryptedPayload: string) {
  const oneHourFromNow = getAnHourFromNow();

  return cookies().set(COOKIE_SUPPORT_KEY, encryptedPayload, {
    secure: true,
    httpOnly: true,
    expires: oneHourFromNow,
    sameSite: 'strict',
  });
}

function removeSupportCookie() {
  return cookies().delete(COOKIE_SUPPORT_KEY);
}

export { handleSupportCookie, getDecryptedSupportCookie };
