'use client';

import { defaultColorScheme } from '../dsfr/defaultColorScheme';
import Link from 'next/link';
import { startReactDsfr } from '@codegouvfr/react-dsfr/spa';

declare module '@codegouvfr/react-dsfr/next-app-router' {
  interface RegisterLink {
    Link: typeof Link;
  }
}

startReactDsfr({
  defaultColorScheme,
  Link,
  trustedTypesPolicyName: 'react-dsfr',
});

export function StartDsfr() {
  //Yes, leave null here.
  return null;
}
