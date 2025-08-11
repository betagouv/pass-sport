'use client';

import SimplifiedEligibilityTest from '@/app/components/simplified-eligibility-test/SimplifiedEligibilityTest';
import { useState } from 'react';
import MissionCards from '@/app/components/mission-cards/MissionCards';

const EligibilityTestWrapper = () => {
  const [success, setSuccess] = useState<boolean | null>(null);

  return (
    <>
      <SimplifiedEligibilityTest
        display="column"
        buttonVariant="primary"
        onCompletion={setSuccess}
        headingLevel="h2"
        jeDonneMonAvisBtnPadding
      />
      {success !== null && (
        <section className="fr-px-5w fr-pt-0w fr-pb-5w fr-mt-5w">
          <MissionCards isUsingSuccessUrls={success} />
        </section>
      )}
    </>
  );
};

export default EligibilityTestWrapper;
