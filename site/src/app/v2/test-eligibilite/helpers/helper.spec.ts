import { convertDate } from './helper';
import { isSanitairesAndSociauxBoursiersBFC } from '@/app/v2/test-eligibilite-base/helpers/helpers';

describe('test helpers', () => {
  describe('convertDate', () => {
    it('should convert date', () => {
      expect(convertDate('2020-02-10')).toEqual('10/02/2020');
    });

    it('should return null when input is not a date', () => {
      expect(convertDate('test')).toEqual(null);
    });
  });

  describe('isSanitairesAndSociauxBoursiersBFC tests suites', () => {
    it.each(['D24-123456', 'D24-000000', 'D24-111111', 'D24-999999'])(
      'Should return true for matricule %s',
      (matricule) => {
        expect(isSanitairesAndSociauxBoursiersBFC(matricule)).toBeTruthy();
      },
    );

    it.each([
      'D24-12345X',
      'D24-XXXQWE',
      'D24-X112234',
      'XXXXXX',
      '123456',
      'D23-123456',
      'D22-111111',
    ])('Should return false for matricule %s', (matricule) => {
      expect(isSanitairesAndSociauxBoursiersBFC(matricule)).toBeFalsy();
    });
  });
});
