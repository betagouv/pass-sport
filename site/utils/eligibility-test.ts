import { isWithinInterval, parse } from 'date-fns';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

export enum ALLOCATION {
  NONE = 'none',
  AAH = 'aah',
  AEEH = 'aeeh',
  ARS = 'ars',
  CROUS = 'crous',
  FORMATIONS_SANITAIRES_SOCIAUX = 'formations-sanitaires-sociaux',
}

export enum AEEH_CODE_OBTENTION_TYPE {
  FORM = 'form',
  LINK = 'link',
}

export const ALLOWANCE_MAPPING_TO_ALLOCATION: { [key in ALLOWANCE]: ALLOCATION } = {
  [ALLOWANCE.NONE]: ALLOCATION.NONE,
  [ALLOWANCE.AAH]: ALLOCATION.AAH,
  [ALLOWANCE.AEEH]: ALLOCATION.AEEH,
  [ALLOWANCE.ARS]: ALLOCATION.ARS,
  [ALLOWANCE.CROUS]: ALLOCATION.CROUS,
  [ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX]: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
};

const DATE_FORMAT = 'dd/MM/yyyy';

function isBetween({
  inputDates,
}: {
  inputDates: {
    targetDate: string;
    startDate: string;
    endDate: string;
  };
}) {
  const targetDate = parse(inputDates.targetDate, 'yyyy-MM-dd', new Date());
  const startDate = parse(inputDates.startDate, DATE_FORMAT, new Date());
  const endDate = parse(inputDates.endDate, DATE_FORMAT, new Date());

  return isWithinInterval(targetDate, {
    start: startDate,
    end: endDate,
  });
}

/**
 * Get the way to obtain code for AEEH
 * <ul>
 * <li>For 18 to 20 years old, it should display the link (01/01/2005 to 31/12/2007)</li>
 * <li>For 14 to 17 years old, it should display the form (01/01/2008 to 31/12/2011)</li>
 * <li>For 6 to 13 years old, it should display the link (01/01/2012 to 31/12/2019)</li>
 * </ul>
 * @param targetDate
 */
export function getAeehCodeObtentionType(targetDate: string): {
  isEligible: boolean;
  displayType: AEEH_CODE_OBTENTION_TYPE;
} {
  const _isEligible = isEligible({ targetDate, allocationName: ALLOCATION.AEEH });

  return {
    isEligible: _isEligible,
    displayType: AEEH_CODE_OBTENTION_TYPE.FORM,
  };
}

export function isEligible({
  targetDate,
  allocationName,
}: {
  targetDate: string;
  allocationName: ALLOCATION;
}) {
  switch (allocationName) {
    case ALLOCATION.AEEH:
      return isBetween({
        inputDates: {
          targetDate,
          startDate: '01/01/2005',
          endDate: '31/12/2019',
        },
      });
    case ALLOCATION.ARS:
      return isBetween({
        inputDates: {
          targetDate,
          startDate: '01/01/2008',
          endDate: '31/12/2011',
        },
      });
    case ALLOCATION.CROUS:
    case ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX:
      return isBetween({
        inputDates: {
          targetDate,
          startDate: '01/01/1997',
          endDate: '31/12/2025',
        },
      });
    case ALLOCATION.AAH:
      return isBetween({
        inputDates: {
          targetDate,
          startDate: '01/01/1995',
          endDate: '31/12/2009',
        },
      });
    case ALLOCATION.NONE:
      return false;
  }
}
