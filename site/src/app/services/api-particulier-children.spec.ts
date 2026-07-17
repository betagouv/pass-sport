import {
  childAllowancesToCheck,
  enfantToIdentity,
  planChildrenChecks,
  toIsoBirthdate,
} from '@/app/services/api-particulier-children';
import type { FranceConnectIdentity } from '@/app/services/france-connect';
import type { PersonneQuotientFamilial } from '@/types/ApiParticulier';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

const parent: FranceConnectIdentity = {
  sub: 'fc-parent',
  given_name: 'Marie',
  family_name: 'DURAND',
  birthdate: '1985-03-12',
  gender: 'female',
  birthplace: '75107',
  birthcountry: '99100',
};

const enfant = (overrides: Partial<PersonneQuotientFamilial> = {}): PersonneQuotientFamilial => ({
  nom_naissance: 'DURAND',
  prenoms: 'LEO PAUL',
  date_naissance: '2010-06-01',
  sexe: 'M',
  ...overrides,
});

describe('toIsoBirthdate', () => {
  it('keeps ISO dates and truncates timestamps', () => {
    expect(toIsoBirthdate('2010-06-01')).toBe('2010-06-01');
    expect(toIsoBirthdate('2010-06-01T00:00:00')).toBe('2010-06-01');
  });

  it('converts French JJ/MM/AAAA dates', () => {
    expect(toIsoBirthdate('01/06/2010')).toBe('2010-06-01');
  });

  it('returns undefined on missing or unknown formats', () => {
    expect(toIsoBirthdate(undefined)).toBeUndefined();
    expect(toIsoBirthdate('')).toBeUndefined();
    expect(toIsoBirthdate('06-2010')).toBeUndefined();
  });
});

describe('enfantToIdentity', () => {
  it('builds a child pivot from QF data and takes the birth COG from the parent', () => {
    expect(enfantToIdentity(enfant(), parent)).toEqual({
      sub: 'qf-enfant',
      family_name: 'DURAND',
      preferred_username: undefined,
      given_name: 'LEO PAUL',
      gender: 'male',
      birthdate: '2010-06-01',
      birthplace: '75107',
      birthcountry: '99100',
    });
  });

  it('falls back to nom_usage when nom_naissance is missing', () => {
    const identity = enfantToIdentity(
      enfant({ nom_naissance: undefined, nom_usage: 'MARTIN' }),
      parent,
    );
    expect(identity?.family_name).toBe('MARTIN');
    expect(identity?.preferred_username).toBe('MARTIN');
  });

  it('returns null when the QF pivot is incomplete', () => {
    expect(
      enfantToIdentity(enfant({ nom_naissance: undefined, nom_usage: undefined }), parent),
    ).toBeNull();
    expect(enfantToIdentity(enfant({ prenoms: undefined }), parent)).toBeNull();
    expect(enfantToIdentity(enfant({ date_naissance: undefined }), parent)).toBeNull();
    expect(enfantToIdentity(enfant({ date_naissance: 'invalid' }), parent)).toBeNull();
  });

  it('propagates an absent parent birth COG as undefined', () => {
    const identity = enfantToIdentity(enfant(), { sub: 'fc-parent' });
    expect(identity?.birthplace).toBeUndefined();
    expect(identity?.birthcountry).toBeUndefined();
  });
});

describe('childAllowancesToCheck', () => {
  const both = [ALLOWANCE.ARS, ALLOWANCE.AEEH];

  it('keeps ARS only for children born between 01/01/2009 and 31/12/2014', () => {
    expect(childAllowancesToCheck('2009-01-01', [ALLOWANCE.ARS])).toEqual([ALLOWANCE.ARS]);
    expect(childAllowancesToCheck('2014-12-31', [ALLOWANCE.ARS])).toEqual([ALLOWANCE.ARS]);
    expect(childAllowancesToCheck('2008-12-31', [ALLOWANCE.ARS])).toEqual([]);
    expect(childAllowancesToCheck('2015-01-01', [ALLOWANCE.ARS])).toEqual([]);
  });

  it('keeps AEEH only for children born between 01/01/2007 and 31/12/2020', () => {
    expect(childAllowancesToCheck('2007-01-01', [ALLOWANCE.AEEH])).toEqual([ALLOWANCE.AEEH]);
    expect(childAllowancesToCheck('2020-12-31', [ALLOWANCE.AEEH])).toEqual([ALLOWANCE.AEEH]);
    expect(childAllowancesToCheck('2006-12-31', [ALLOWANCE.AEEH])).toEqual([]);
    expect(childAllowancesToCheck('2021-01-01', [ALLOWANCE.AEEH])).toEqual([]);
  });

  it('only returns the harvested aides', () => {
    expect(childAllowancesToCheck('2010-06-01', [])).toEqual([]);
    expect(childAllowancesToCheck('2010-06-01', [ALLOWANCE.AAH])).toEqual([]);
    expect(childAllowancesToCheck('2010-06-01', [ALLOWANCE.AEEH])).toEqual([ALLOWANCE.AEEH]);
  });

  it('lets ARS and AEEH coexist when both windows contain the birthdate', () => {
    expect(childAllowancesToCheck('2010-06-01', both)).toEqual([ALLOWANCE.ARS, ALLOWANCE.AEEH]);
    // Born 2019: inside the AEEH window, outside the ARS one.
    expect(childAllowancesToCheck('2019-06-01', both)).toEqual([ALLOWANCE.AEEH]);
  });
});

describe('planChildrenChecks', () => {
  it('plans one check per eligible (child, aide) pair, keeping the QF child index', () => {
    const enfants = [
      enfant({ prenoms: 'LEO', date_naissance: '2010-06-01' }), // ARS + AEEH
      enfant({ prenoms: 'ZOE', date_naissance: '2019-06-01' }), // AEEH only
      enfant({ prenoms: 'SAM', date_naissance: '2003-06-01' }), // outside both windows
      enfant({ prenoms: undefined }), // incomplete pivot -> skipped
    ];

    const checks = planChildrenChecks(enfants, parent, [ALLOWANCE.ARS, ALLOWANCE.AEEH]);

    expect(
      checks.map(({ childIndex, allowance, identity }) => ({
        childIndex,
        allowance,
        prenom: identity.given_name,
      })),
    ).toEqual([
      { childIndex: 0, allowance: ALLOWANCE.ARS, prenom: 'LEO' },
      { childIndex: 0, allowance: ALLOWANCE.AEEH, prenom: 'LEO' },
      { childIndex: 1, allowance: ALLOWANCE.AEEH, prenom: 'ZOE' },
    ]);
  });

  it('plans nothing when the aide was not harvested', () => {
    expect(planChildrenChecks([enfant()], parent, [ALLOWANCE.AAH])).toEqual([]);
  });

  it('carries the parent birth COG on every planned identity', () => {
    const [check] = planChildrenChecks([enfant()], parent, [ALLOWANCE.ARS]);
    expect(check.identity.birthplace).toBe('75107');
    expect(check.identity.birthcountry).toBe('99100');
  });
});
