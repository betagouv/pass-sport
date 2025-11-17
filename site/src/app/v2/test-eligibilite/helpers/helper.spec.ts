import { convertDate } from './helper';

describe('test helpers', () => {
  describe('convertDate', () => {
    it('should convert date', () => {
      expect(convertDate('2020-02-10')).toEqual('10/02/2020');
    });

    it('should return null when input is not a date', () => {
      expect(convertDate('test')).toEqual(null);
    });
  });
});
