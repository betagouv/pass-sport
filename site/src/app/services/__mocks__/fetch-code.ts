import {
  ConfirmResponseBody,
  EnhancedConfirmResponseBody,
  EnhancedConfirmResponseBodyItem,
} from 'types/EligibilityTest';

export const fetchCode = (responseBody: ConfirmResponseBody): EnhancedConfirmResponseBody => {
  const enhancedEligible: EnhancedConfirmResponseBodyItem = { ...responseBody[0] };

  return [enhancedEligible];
};
