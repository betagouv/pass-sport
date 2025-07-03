import { isWithinInterval, parse, startOfDay } from 'date-fns';

export enum ALLOCATION {
  NONE = 'none',
  AAH = 'aah',
  AEEH = 'aeeh',
  ARS = 'ars',
  CROUS = 'crous',
  FORMATIONS_SANITAIRES_SOCIAUX = 'formations-sanitaires-sociaux',
}

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
          startDate: '01/01/2006',
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
