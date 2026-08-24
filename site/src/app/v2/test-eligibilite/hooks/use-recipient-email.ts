import { useState } from 'react';
import { InputState } from '@/types/form';
import { mapper } from '../helpers/helper';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The e-mail asked for at the very end of step two, shared by the five forms. It is the only
 * address known when LCA finds nobody, so the outcome mail always goes there.
 */
export const useRecipientEmail = () => {
  const [inputState, setInputState] = useState<InputState>({ state: 'default' });

  const check = (value: string): string | null => {
    const trimmed = value.trim();

    if (!EMAIL_PATTERN.test(trimmed)) {
      setInputState({ state: 'error', errorMsg: mapper.recipientEmail });
      return null;
    }

    setInputState({ state: 'default' });
    return trimmed;
  };

  // Typing only ever clears an error: flagging a half-typed address on the first keystroke
  // would put every usager in error before they reach the @.
  const onChange = (value: string): void => {
    if (EMAIL_PATTERN.test(value.trim())) {
      setInputState({ state: 'default' });
    }
  };

  const onBlur = (value: string): void => {
    if (value.trim()) {
      check(value);
    }
  };

  const validate = (formData: FormData): string | null =>
    check((formData.get('recipientEmail') ?? '').toString());

  return { inputState, onChange, onBlur, validate };
};
