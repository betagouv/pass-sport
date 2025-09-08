// Context
// nés entre le 1er janvier 2008 et le 31 décembre 2011 et bénéficient de l'allocation de rentrée scolaire
// nés entre le 1er janvier 2006 et le 31 décembre 2019 et bénéficient de l'allocation d'éducation de l'enfant handicapé

import {
  AEEH_CODE_OBTENTION_TYPE,
  ALLOCATION,
  getAeehCodeObtentionType,
  isEligible,
} from './eligibility-test';

// nés entre le 1er janvier 1995 et le 31 décembre 2009 et bénéficient de l'allocation aux adultes handicapés
describe('Eligibility tests suite', () => {
  describe('isEligible() tests suite', () => {
    describe('Should be eligible for', () => {
      it('AAH', () => {
        // nés entre le 1er janvier 1995 et le 31 décembre 2009 et bénéficient de l'allocation aux adultes handicapés
        expect(
          isEligible({ targetDate: '1995-01-01', allocationName: ALLOCATION.AAH }),
        ).toBeTruthy();
        expect(
          isEligible({ targetDate: '2009-12-31', allocationName: ALLOCATION.AAH }),
        ).toBeTruthy();
      });
      it('AEEH', () => {
        // nés entre le 1er janvier 2006 et le 31 décembre 2019 et bénéficient de l'allocation d'éducation de l'enfant handicapé
        expect(
          isEligible({ targetDate: '2006-01-01', allocationName: ALLOCATION.AEEH }),
        ).toBeTruthy();
        expect(
          isEligible({ targetDate: '2019-12-31', allocationName: ALLOCATION.AEEH }),
        ).toBeTruthy();
      });
      it('ARS', () => {
        // nés entre le 1er janvier 2008 et le 31 décembre 2011 et bénéficient de l'allocation de rentrée scolaire
        expect(
          isEligible({ targetDate: '2008-01-01', allocationName: ALLOCATION.ARS }),
        ).toBeTruthy();
        expect(
          isEligible({ targetDate: '2011-12-31', allocationName: ALLOCATION.ARS }),
        ).toBeTruthy();
      });
      it('CROUS, Formation sanitaires et sociales', () => {
        expect(
          isEligible({ targetDate: '1997-01-01', allocationName: ALLOCATION.CROUS }),
        ).toBeTruthy();
        expect(
          isEligible({ targetDate: '2025-12-31', allocationName: ALLOCATION.CROUS }),
        ).toBeTruthy();

        expect(
          isEligible({
            targetDate: '1997-01-01',
            allocationName: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
          }),
        ).toBeTruthy();
        expect(
          isEligible({
            targetDate: '2025-12-31',
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
        // nés entre le 1er janvier 1995 et le 31 décembre 2009 et bénéficient de l'allocation aux adultes handicapés
        expect(
          isEligible({ targetDate: '1994-12-31', allocationName: ALLOCATION.AAH }),
        ).toBeFalsy();
        expect(
          isEligible({ targetDate: '2010-01-01', allocationName: ALLOCATION.AAH }),
        ).toBeFalsy();
      });
      it('AEEH', () => {
        // nés entre le 1er janvier 2006 et le 31 décembre 2019 et bénéficient de l'allocation d'éducation de l'enfant handicapé
        expect(
          isEligible({ targetDate: '2005-12-31', allocationName: ALLOCATION.AEEH }),
        ).toBeFalsy();
        expect(
          isEligible({ targetDate: '2020-01-01', allocationName: ALLOCATION.AEEH }),
        ).toBeFalsy();
      });
      it('ARS', () => {
        // nés entre le 1er janvier 2008 et le 31 décembre 2011 et bénéficient de l'allocation de rentrée scolaire
        expect(
          isEligible({ targetDate: '2007-12-31', allocationName: ALLOCATION.ARS }),
        ).toBeFalsy();
        expect(
          isEligible({ targetDate: '2012-01-01', allocationName: ALLOCATION.ARS }),
        ).toBeFalsy();
      });
      it('CROUS, Formation sanitaires et sociales', () => {
        expect(
          isEligible({ targetDate: '1996-12-31', allocationName: ALLOCATION.CROUS }),
        ).toBeFalsy();
        expect(
          isEligible({ targetDate: '2026-01-01', allocationName: ALLOCATION.CROUS }),
        ).toBeFalsy();

        expect(
          isEligible({
            targetDate: '1996-12-31',
            allocationName: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
          }),
        ).toBeFalsy();
        expect(
          isEligible({
            targetDate: '2026-01-01',
            allocationName: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
          }),
        ).toBeFalsy();
      });
    });
  });

  // <li>For 6 to 13 years old, it should display the link (01/01/2012 to 31/12/2019)</li>
  // <li>For 14 to 19 years old, it should display the form (01/01/2006 to 31/12/2011)</li>
  describe('getAeehCodeObtentionType() tests suite', () => {
    it(`should return obtention type ${AEEH_CODE_OBTENTION_TYPE.LINK}`, () => {
      expect(getAeehCodeObtentionType('2012-01-01')).toEqual({
        isEligible: true,
        displayType: AEEH_CODE_OBTENTION_TYPE.LINK,
      });

      expect(getAeehCodeObtentionType('2019-12-31')).toEqual({
        isEligible: true,
        displayType: AEEH_CODE_OBTENTION_TYPE.LINK,
      });

      expect(getAeehCodeObtentionType('2006-01-01')).toEqual({
        isEligible: true,
        displayType: AEEH_CODE_OBTENTION_TYPE.LINK,
      });

      expect(getAeehCodeObtentionType('2007-12-31')).toEqual({
        isEligible: true,
        displayType: AEEH_CODE_OBTENTION_TYPE.LINK,
      });
    });

    it(`should return obtention type ${AEEH_CODE_OBTENTION_TYPE.FORM}`, () => {
      expect(getAeehCodeObtentionType('2008-01-01')).toEqual({
        isEligible: true,
        displayType: AEEH_CODE_OBTENTION_TYPE.FORM,
      });

      expect(getAeehCodeObtentionType('2011-12-31')).toEqual({
        isEligible: true,
        displayType: AEEH_CODE_OBTENTION_TYPE.FORM,
      });
    });
  });
});
