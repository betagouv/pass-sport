'use client';

import Checkbox from '@codegouvfr/react-dsfr/Checkbox';
import { useEffect, useState } from 'react';

type MatomoTracker = {
  isUserOptedOut: () => boolean;
};

const OPT_OUT_COOKIE_LIFETIME_IN_HOURS = 395 * 24;

const pushToMatomo = (command: unknown[]) => {
  window._paq = window._paq ?? [];
  window._paq.push(command);
};

export default function MatomoOptOut() {
  const [isOptedOut, setIsOptedOut] = useState<boolean | null>(null);

  useEffect(() => {
    pushToMatomo([
      function readOptOutState(this: MatomoTracker) {
        setIsOptedOut(this.isUserOptedOut());
      },
    ]);
  }, []);

  if (isOptedOut === null) {
    return null;
  }

  return (
    <Checkbox
      options={[
        {
          label: "J'accepte la mesure d'audience anonyme de ma navigation",
          nativeInputProps: {
            checked: !isOptedOut,
            onChange: (event) => {
              const isAccepted = event.target.checked;
              pushToMatomo(
                isAccepted
                  ? ['forgetUserOptOut']
                  : ['optUserOut', OPT_OUT_COOKIE_LIFETIME_IN_HOURS],
              );
              setIsOptedOut(!isAccepted);
            },
          },
        },
      ]}
    />
  );
}
