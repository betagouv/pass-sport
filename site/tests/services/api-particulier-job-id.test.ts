import {
  ApiParticulierJobData,
  SITUATION,
  apiParticulierJobId,
} from 'src/app/services/eligibility-job';
import { CAISSE } from '@/utils/eligibility-test';

const allocataire = {
  family_name: 'Martin',
  given_name: 'Claude',
  birthdate: '1980-03-02',
  gender: 'female' as const,
  birthplace: '75056',
  birthcountry: '99100',
  email: 'claude.martin@example.test',
};

const job = (overrides: Partial<ApiParticulierJobData> = {}): ApiParticulierJobData => ({
  aide: SITUATION.QF,
  caisse: CAISSE.CAF,
  beneficiary: { lastname: 'Enfant', firstname: 'Cadet', birthdate: '2012-01-01' },
  allocataire,
  birthCountryIso: 'FR',
  cafNumber: '1234567',
  residenceInsee: '75113',
  email: 'claude.martin@example.test',
  ...overrides,
});

describe('apiParticulierJobId', () => {
  it('is stable across resubmissions of the same request', () => {
    expect(apiParticulierJobId(job())).toBe(apiParticulierJobId(job()));
  });

  it('leaks neither a name nor a birthdate', () => {
    const id = apiParticulierJobId(job());

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain('enfant');
    expect(id).not.toContain('2012');
  });

  describe.each([SITUATION.QF, SITUATION.AEEH])('%s hashes the beneficiary identity', (aide) => {
    it('changes when the child changes', () => {
      expect(apiParticulierJobId(job({ aide }))).not.toBe(
        apiParticulierJobId(
          job({
            aide,
            beneficiary: { lastname: 'Enfant', firstname: 'Aine', birthdate: '2008-01-01' },
          }),
        ),
      );
    });

    it('does not change when the allocataire is named differently', () => {
      expect(apiParticulierJobId(job({ aide }))).toBe(
        apiParticulierJobId(
          job({ aide, allocataire: { ...allocataire, given_name: 'Dominique' } }),
        ),
      );
    });

    // The pivot fields a child does not carry are taken from the allocataire, so they are
    // part of the child's identity and have to move the digest.
    const INHERITED = {
      gender: { ...allocataire, gender: 'male' as const },
      birthplace: { ...allocataire, birthplace: '69123' },
      birthcountry: { ...allocataire, birthcountry: '99134' },
    };

    it.each(Object.keys(INHERITED) as (keyof typeof INHERITED)[])(
      'changes when the allocataire %s differs, which the child inherits',
      (field) => {
        expect(apiParticulierJobId(job({ aide }))).not.toBe(
          apiParticulierJobId(job({ aide, allocataire: INHERITED[field] })),
        );
      },
    );
  });

  describe.each([SITUATION.AAH, SITUATION.CROUS, SITUATION.FSS])(
    '%s hashes the allocataire identity',
    (aide) => {
      it('changes when the allocataire changes', () => {
        expect(apiParticulierJobId(job({ aide }))).not.toBe(
          apiParticulierJobId(
            job({ aide, allocataire: { ...allocataire, given_name: 'Dominique' } }),
          ),
        );
      });

      it('changes when only the birthplace differs', () => {
        expect(apiParticulierJobId(job({ aide }))).not.toBe(
          apiParticulierJobId(job({ aide, allocataire: { ...allocataire, birthplace: '69123' } })),
        );
      });

      it('does not change when the beneficiary block changes', () => {
        expect(apiParticulierJobId(job({ aide }))).toBe(
          apiParticulierJobId(
            job({
              aide,
              beneficiary: { lastname: 'Autre', firstname: 'Personne', birthdate: '2000-01-01' },
            }),
          ),
        );
      });
    },
  );

  it('separates two routes claimed by the same person', () => {
    expect(apiParticulierJobId(job({ aide: SITUATION.QF }))).not.toBe(
      apiParticulierJobId(job({ aide: SITUATION.AEEH })),
    );
  });

  it('ignores case and surrounding whitespace', () => {
    expect(apiParticulierJobId(job())).toBe(
      apiParticulierJobId(
        job({
          beneficiary: { lastname: '  ENFANT ', firstname: 'cadet', birthdate: '2012-01-01' },
        }),
      ),
    );
  });
});
