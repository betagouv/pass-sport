import { useState } from 'react';
import { AGE_RANGE } from '../types/types';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import { useRouter } from 'next/navigation';
import rootStyles from '@/app/utilities.module.scss';
import cn from 'classnames';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';
import { trackRedirectionToPassSportForm } from '@/app/v2/test-eligibilite-base/helpers/helpers';
import CustomRadioButtons from '../customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';

interface Props {
  ageRange: AGE_RANGE;
}

const AeehStep = ({ ageRange }: Props) => {
  const [hasAeehAllocation, setHasAeehAllocation] = useState<boolean | null>(null);
  const [isValidated, setIsValidated] = useState(true);

  const router = useRouter();

  const fieldsetId = 'aeehStep-fieldset';
  useRemoveAttributeById(fieldsetId, 'aria-labelledby');

  const buttonClickedHandler = () => {
    setIsValidated(true);
  };

  const displaySuccess = hasAeehAllocation;
  const displayFailure =
    ageRange === AGE_RANGE.BETWEEN_19_30 ||
    (ageRange === AGE_RANGE.BETWEEN_6_19 && hasAeehAllocation === false);

  return (
    <>
      {ageRange !== AGE_RANGE.BETWEEN_19_30 && (
        <CustomRadioButtons
          id={fieldsetId}
          name="aeehStep"
          legendLine1={
            <>
              Vos parents bénéficient-ils de l&apos;allocation d&apos;éducation de l&apos;enfant
              handicapé (<abbr>AEEH</abbr>) ?
            </>
          }
          legendLine2="Si vous ne le savez pas, rapprochez vous de vos parents, ils sauront vous répondre."
          isOkButtonDisabled={isValidated}
          onOkButtonClicked={buttonClickedHandler}
          options={[
            {
              label: 'Oui',
              nativeInputProps: {
                onChange: () => {
                  setHasAeehAllocation(true);
                  setIsValidated(false);
                },
              },
            },
            {
              label: 'Non',
              nativeInputProps: {
                onChange: () => {
                  setHasAeehAllocation(false);
                  setIsValidated(false);
                },
              },
            },
          ]}
        />
      )}

      {isValidated && displaySuccess && (
        <VerdictPanel
          title="Bonne nouvelle ! D'après les informations que vous nous avez transmises, vous
          êtes éligible au pass Sport."
          isSuccess
          buttonProps={{
            children: "Accéder au formulaire d'obtention du pass Sport",
            onClick: () => {
              trackRedirectionToPassSportForm();
              router.push('test-eligibilite');
            },
          }}
        >
          <p className={cn('fr-text--lg', rootStyles['text--medium'], rootStyles['text--black'])}>
            Il vous permettra de déduire 50 euros de votre adhésion sportif dans plus de 85 000
            clubs et associations sportives partenaires dans toute la France.
          </p>
        </VerdictPanel>
      )}

      {isValidated && displayFailure && <FullNegativeVerdictPanel isLean={false} />}
    </>
  );
};

export default AeehStep;
