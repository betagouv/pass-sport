'use client';

import SimplifiedEligibilityTest from '@/app/components/simplified-eligibility-test/SimplifiedEligibilityTest';
import { useState } from 'react';
import MissionCards from '@/app/components/mission-cards/MissionCards';

const EligibilityTestWwrapper = () => {
  const [success, setSuccess] = useState<boolean | null>(null);

  return (
    <>
      <SimplifiedEligibilityTest
        display="column"
        buttonVariant="secondary"
        onCompletion={setSuccess}
        headingLevel="h2"
      />
      {success !== null && (
        <section className="fr-px-5w fr-pt-0w fr-pb-5w">
          <MissionCards isUsingSuccessUrls={success} />
        </section>
      )}
    </>
  );
};

export default EligibilityTestWwrapper;
