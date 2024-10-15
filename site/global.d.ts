// global.d.ts

import { SUPPORT_COOKIE_KEY, WAITING_STATE, WAIT_STATE } from '@/app/constants/cookie-manager';

export {};

declare global {
  export interface Window {
    tarteaucitron?: TarteAuCitronSDK;
  }

  export interface Element {
    style: {
      display: 'none' | 'inherit' | 'block';
    };
  }

  export interface HTMLElement {
    async: boolean;
    src: string;
  }
}

export type CookiesCompleteChoice = Record<string, boolean>;

export interface OverlayOpenCookiesChoice {
  currentStepIndex: number;
  highlightVendor: 'vimeo' | 'crisp';
  steps: any[];
}

export type Choice = CookiesCompleteChoice | OverlayOpenCookiesChoice;

interface TarteAuCitronSDK {
  userInterface?: {
    openPanel: () => {};
    openAlert: () => {};
    addClass: (id: string, className: string) => void;
  };
  parameters: {
    useExternalCss: boolean;
  };
  job?: string[];
  user: Record<string, object>;
  triggerJobsAfterAjaxCall?: VoidFunction;
  initEvents: { loadEvent: (isOldBrowser: boolean) => void };
  services: Record<
    string,
    {
      key: string;
      type: 'ads' | 'analytic' | 'api' | 'comment' | 'other' | 'social' | 'support' | 'video';
      name: string;
      needConsent: boolean;
      cookies: string[];
      readmoreLink: string;
      uri: string;
      js: VoidFunction;
      fallback: VoidFunction;
      // 'waiting' is external to TAC
      // 'wait' is internal to TAC, when it is 'wait', the alert modal is shown unlike 'waiting'
      defaultState?: boolean | WAIT_STATE | WAITING_STATE;
    }
  >;
  state?: {
    vimeo: boolean;
    crisp: boolean;
    [SUPPORT_COOKIE_KEY]: boolean | WAITING_STATE;
  };
}
