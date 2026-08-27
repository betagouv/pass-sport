import { useContext } from 'react';
import { createPortal } from 'react-dom';
import StepOneForm from '../step-one-form/StepOneForm';
import CrousForm from '../step-two-forms/CrousForm';
import { StepChecker } from '@/app/v2/test-eligibilite/components/step-checker/StepChecker';
import EmailSentPanel from '@/app/v2/test-eligibilite/components/panels/email-sent/EmailSentPanel';
import EmailSentAlert from '@/app/v2/test-eligibilite/components/panels/email-sent/EmailSentAlert';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { StepOneFields } from '@/types/EligibilityTest';

// Boursiers are their own beneficiary and their organisme is always the CNOUS, so there is
// only ever one step-two form on this branch.
const CrousEligibilityTestForms = () => {
  const {
    portalNode,
    stepOneFields,
    setStepOneFields,
    isStepOneValidated,
    setIsStepOneValidated,
    submittedEmail,
    setSubmittedEmail,
  } = useContext(EligibilityTestContext);

  const validateStepOne = (fields: StepOneFields) => {
    setStepOneFields(fields);
    setIsStepOneValidated(true);
  };

  const editStepOne = () => {
    setIsStepOneValidated(false);
    setSubmittedEmail(null);
  };

  return (
    <>
      {submittedEmail && <EmailSentAlert />}

      {isStepOneValidated && (
        <StepChecker title="Vos informations" onClick={editStepOne} className="fr-mt-2w" />
      )}

      {!isStepOneValidated && (
        <div id="second-step-form" className="fr-fieldset" role="presentation">
          <StepOneForm
            onValidated={validateStepOne}
            initialFields={stepOneFields}
            isDirectBeneficiary
          />
        </div>
      )}

      {isStepOneValidated && (
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
