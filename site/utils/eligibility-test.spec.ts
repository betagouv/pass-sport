import { ALLOCATION, isEligible } from './eligibility-test';

describe('Eligibility tests suite', () => {
  describe('isEligible() tests suite', () => {
    describe('Should be eligible for', () => {
      it('AAH', () => {
        // Between 16 and 30 years old
        // nés entre le 1er janvier 1996 et le 31 décembre 2010 et bénéficient de l'allocation aux adultes handicapés
        expect(
          isEligible({ targetDate: '1996-01-01', allocationName: ALLOCATION.AAH }),
        ).toBeTruthy();
        expect(
          isEligible({ targetDate: '2010-12-31', allocationName: ALLOCATION.AAH }),
        ).toBeTruthy();
      });
      it('AEEH', () => {
        // Between 6 and 19 years old
        // nés entre le 1er janvier 2007 et le 31 décembre 2020 et bénéficient de l'allocation d'éducation de l'enfant handicapé
        expect(
          isEligible({ targetDate: '2007-01-01', allocationName: ALLOCATION.AEEH }),
        ).toBeTruthy();
        expect(
          isEligible({ targetDate: '2020-12-31', allocationName: ALLOCATION.AEEH }),
        ).toBeTruthy();
      });
      it('QF', () => {
        // Between 6 and 17 years old
        // nés entre le 1er janvier 2009 et le 31 décembre 2020 et éligibles au quotient familial
        expect(
          isEligible({ targetDate: '2009-01-01', allocationName: ALLOCATION.QF }),
        ).toBeTruthy();
        expect(
          isEligible({ targetDate: '2020-12-31', allocationName: ALLOCATION.QF }),
        ).toBeTruthy();
      });
      it('CROUS, Formation sanitaires et sociales', () => {
        // Up to 28 years old
        expect(
          isEligible({ targetDate: '1998-01-01', allocationName: ALLOCATION.CROUS }),
        ).toBeTruthy();
        expect(
          isEligible({ targetDate: '2026-12-31', allocationName: ALLOCATION.CROUS }),
        ).toBeTruthy();

        expect(
          isEligible({
            targetDate: '1998-01-01',
            allocationName: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
          }),
        ).toBeTruthy();
        expect(
          isEligible({
            targetDate: '2026-12-31',
            allocationName: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
          }),
        ).toBeTruthy();
      });
    });

    describe('Should not be eligible for', () => {
      it('None', () => {
        expect(
          isEligible({ targetDate: '2000-12-31', allocationName: ALLOCATION.NONE }),
        ).toBeFalsy();
      });

      it('AAH', () => {
        // 31 years old
        expect(
          isEligible({ targetDate: '1995-01-01', allocationName: ALLOCATION.AAH }),
        ).toBeFalsy();

        // 15 years old
        expect(
          isEligible({ targetDate: '2011-12-31', allocationName: ALLOCATION.AAH }),
        ).toBeFalsy();
      });
      it('AEEH', () => {
        // 20 years old
        expect(
          isEligible({ targetDate: '2006-01-01', allocationName: ALLOCATION.AEEH }),
        ).toBeFalsy();

        // 5 years old
        expect(
          isEligible({ targetDate: '2021-12-31', allocationName: ALLOCATION.AEEH }),
        ).toBeFalsy();
      });
      it('QF', () => {
        // 5 years old
        expect(isEligible({ targetDate: '2021-12-31', allocationName: ALLOCATION.QF })).toBeFalsy();

        // 18 years old
        expect(isEligible({ targetDate: '2008-01-01', allocationName: ALLOCATION.QF })).toBeFalsy();
      });

      it('CROUS, Formation sanitaires et sociales', () => {
        expect(
          isEligible({ targetDate: '1997-01-01', allocationName: ALLOCATION.CROUS }),
        ).toBeFalsy();

        expect(
          isEligible({
            targetDate: '1997-12-31',
            allocationName: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
          }),
        ).toBeFalsy();
      });
    });
  });
});
