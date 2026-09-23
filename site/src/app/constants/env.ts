export const CODES_OBTAINABLE = process.env.NEXT_PUBLIC_CODES_OBTAINABLE === 'yes';
export const CODES_OBTAINABLE_FOR_CROUS =
  process.env.NEXT_PUBLIC_CODES_OBTAINABLE_FOR_CROUS === 'yes';

export const IS_PRODUCTION_ENV = process.env.NEXT_PUBLIC_ENV === 'production';
export const IS_LOCAL_ENV = process.env.NEXT_PUBLIC_ENV === 'local';
export const CHATBOT_IS_ACTIVATED = process.env.NEXT_PUBLIC_CHATBOT_IS_ACTIVATED === 'yes';

export const PARCOURS_HORS_FC_ENABLED = process.env.PARCOURS_HORS_FC_ENABLED === 'yes';
export const FC_ENABLED_FOR_DEBUGGING = process.env.FC_ENABLED_FOR_DEBUGGING === 'yes';
export const FC_DEBUGGING_ONLY = FC_ENABLED_FOR_DEBUGGING && !CODES_OBTAINABLE;

export const FC_RELANCE_ENABLED = process.env.FC_RELANCE_ENABLED === 'yes';
export const FC_RELANCE_ALLOWLIST_ONLY = process.env.FC_RELANCE_ALLOWLIST_ONLY === 'yes';

const DEFAULT_FC_RELANCE_COOLDOWN_DAYS = 2;

const readCooldownDays = (): number => {
  const raw = process.env.FC_RELANCE_COOLDOWN_DAYS;
  if (!raw?.trim()) return DEFAULT_FC_RELANCE_COOLDOWN_DAYS;

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;

  console.warn(
    `[pass-sport] FC_RELANCE_COOLDOWN_DAYS="${raw}" is not a non-negative number, using ${DEFAULT_FC_RELANCE_COOLDOWN_DAYS}`,
  );
  return DEFAULT_FC_RELANCE_COOLDOWN_DAYS;
};

export const FC_RELANCE_COOLDOWN_DAYS = readCooldownDays();
