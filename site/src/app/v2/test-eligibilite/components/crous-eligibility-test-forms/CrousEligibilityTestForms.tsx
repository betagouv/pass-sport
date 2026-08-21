import { useContext } from 'react';
import { createPortal } from 'react-dom';
import StepOneForm from '../step-one-form/StepOneForm';
import CrousForm from '../step-two-forms/CrousForm';
import { StepChecker } from '@/app/v2/test-eligibilite/components/step-checker/StepChecker';
import EmailSentPanel from '@/app/v2/test-eligibilite/components/email-sent-panel/EmailSentPanel';
import EligibilityTestContext from '@/store/eligibilityTestContext';

// Boursiers are their own beneficiary and their organisme is always the CNOUS, so there is
// only ever one step-two form on this branch.
const CrousEligibilityTestForms = () => {
  const { portalNode, stepOneFields, setStepOneFields, submittedEmail, setSubmittedEmail } =
    useContext(EligibilityTestContext);

  const editStepOne = () => {
    setStepOneFields(null);
    setSubmittedEmail(null);
  };

  return (
    <>
      {stepOneFields && (
        <StepChecker title="Vos informations" onClick={editStepOne} className="fr-mt-2w" />
      )}

      {!stepOneFields && (
        <div id="second-step-form" className="fr-fieldset" role="presentation">
          <StepOneForm onValidated={setStepOneFields} isDirectBeneficiary />
        </div>
      )}

      {stepOneFields && (
        <div id="third-step-form" className="fr-fieldset" role="presentation">
          <CrousForm />
        </div>
      )}

      {submittedEmail &&
        portalNode &&
        createPortal(
          <div className="fr-mt-6w">
            <EmailSentPanel />
          </div>,
          portalNode,
        )}
    </>
  );
};

export default CrousEligibilityTestForms;
