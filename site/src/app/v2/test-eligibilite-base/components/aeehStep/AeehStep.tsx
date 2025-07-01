import { useState } from 'react';
import { AGE_RANGE } from '../types/types';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import rootStyles from '@/app/utilities.module.scss';
import cn from 'classnames';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';
import CustomRadioButtons from '../customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import { PASS_SPORT_AMOUNT } from '@/app/constants/wordings';

interface Props {
  ageRange: AGE_RANGE;
}

const AeehStep = ({ ageRange }: Props) => {
  const [hasAeehAllocation, setHasAeehAllocation] = useState<boolean | null>(null);
  const [isValidated, setIsValidated] = useState(true);
  const fieldsetId = 'aeehStep-fieldset';

  useRemoveAttributeById(fieldsetId, 'aria-labelledby');

  const buttonClickedHandler = () => {
    setIsValidated(true);
  };

  const displaySuccess = hasAeehAllocation;
  const displayFailure =
    ageRange === AGE_RANGE.BETWEEN_14_30 ||
    (ageRange === AGE_RANGE.BETWEEN_6_13 && hasAeehAllocation === false);

  return (
    <>
      {ageRange !== AGE_RANGE.BETWEEN_14_30 && (
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
          // todo: enable later in august
          // buttonProps={{
          //   children: "Accéder au formulaire d'obtention du pass Sport",
          //   onClick: () => {
          //     trackRedirectionToPassSportForm();
          //     router.push('test-eligibilite');
          //   },
          // }}
        >
          <p className={cn('fr-text--lg', rootStyles['text--medium'], rootStyles['text--black'])}>
            Il vous permettra de déduire {PASS_SPORT_AMOUNT} euros sur l&apos;inscription prise
            entre le 1er septembre et le 31 décembre 2025, parmi plus de 59 000 clubs, associations
            sportives et salles de sport partenaires.
          </p>
        </VerdictPanel>
      )}

      {isValidated && displayFailure && <FullNegativeVerdictPanel isLean={false} />}
    </>
  );
};

export default AeehStep;
