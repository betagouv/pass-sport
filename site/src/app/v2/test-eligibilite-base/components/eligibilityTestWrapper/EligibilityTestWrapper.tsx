'use client';

import SimplifiedEligibilityTest from '@/app/components/simplified-eligibility-test/SimplifiedEligibilityTest';

const EligibilityTestWrapper = () => {
  return (
    <>
      <SimplifiedEligibilityTest
        display="column"
        buttonVariant="primary"
        headingLevel="h2"
        jeDonneMonAvisBtnPadding
        displaySeparator
      />
    </>
  );
};

export default EligibilityTestWrapper;
