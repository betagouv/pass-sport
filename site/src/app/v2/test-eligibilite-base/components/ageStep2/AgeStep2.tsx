import { useEffect, useRef, useState } from 'react';
import { AGE_RANGE } from '../types/types';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import rootStyles from '@/app/utilities.module.scss';
import cn from 'classnames';
import CustomRadioButtons from '../customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import { CROUS } from '@/app/v2/accueil/components/acronymes/Acronymes';
import { PASS_SPORT_AMOUNT } from '@/app/constants/wordings';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';

interface AgeStep2Props {
  ageRange: AGE_RANGE;
  isForMySelf?: boolean;
}

const AgeStep2 = ({ ageRange, isForMySelf = false }: AgeStep2Props) => {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [isValidated, setIsValidated] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const fieldsetId = 'ageStep2-fieldset';
  useRemoveAttributeById(fieldsetId, 'aria-labelledby');

  const buttonClickedHandler = () => {
    setIsValidated(true);
  };

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
    }
  }, []);

  if (ageRange === AGE_RANGE.GREATER_THAN_30) return null;

  const legendLine1 =
    ageRange === AGE_RANGE.BETWEEN_6_13
      ? !isForMySelf
        ? `Touchez-vous l'Allocation d'Éducation de l'Enfant Handicapé (AEEH) pour votre enfant ?`
        : "Vos parents touchent-ils l'Allocation d'Éducation de l'Enfant Handicapé (AEEH) ?"
      : `Est-ce que vous, ou vos parents, bénéficiez de l'une de ces aides ?`;

  const beforeQuestionText =
    ageRange === AGE_RANGE.BETWEEN_14_30 ? (
      <div tabIndex={-1} ref={ref}>
        <ul className={`fr-ml-2w fr-mb-1w fr-mt-2w ${rootStyles['text--medium']}`}>
          <li className={`fr-mb-1w ${rootStyles['text--medium']}`}>
            Allocation d&apos;éducation de l&apos;enfant handicapé (<abbr>AEEH</abbr>) ;
          </li>
          <li className={`fr-mb-1w ${rootStyles['text--medium']}`}>
            Allocation de rentrée scolaire (<abbr>ARS</abbr>) ;
          </li>
          <li className={`fr-mb-1w ${rootStyles['text--medium']}`}>
            Allocation aux adultes handicapés (<abbr>AAH</abbr>) ;
          </li>
          <li className={`fr-mb-1w ${rootStyles['text--medium']}`}>
            Moins de 28 ans et bourse du <CROUS />
            (y compris l’aide annuelle), attribuée avant le 15 octobre 2025 ;
          </li>
          <li className={`fr-mb-0w ${rootStyles['text--medium']}`}>
            Moins de 28 ans et bourse régionale pour une formation sanitaire ou sociale, attribuée
            avant le 15 octobre 2025.
          </li>
        </ul>
      </div>
    ) : null;

  const questionDescription =
    ageRange === AGE_RANGE.BETWEEN_6_13 ? (
      <>
        L&apos;AEEH est une aide financière versée par votre Caisse d&apos;allocations familiales (
        <abbr>CAF</abbr>) ou votre Mutualité sociale agricole (<abbr>MSA</abbr>). Elle permet de
        compenser vos dépenses liées à la situation de handicap des enfants de moins de 20 ans.
      </>
    ) : (
      ''
    );

  return (
    <div>
      <CustomRadioButtons
        id={fieldsetId}
        name="ageStep2"
        hintText={questionDescription}
        legendLine1={legendLine1}
        isOkButtonDisabled={isValidated}
        onOkButtonClicked={buttonClickedHandler}
        legendDescription={beforeQuestionText}
        options={[
          {
            label: 'Oui',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setConfirmed(true);
              },
            },
          },
          {
            label: 'Non',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setConfirmed(false);
              },
            },
          },
        ]}
      />

      {isValidated && confirmed && (
        <VerdictPanel
          title="Bonne nouvelle ! D'après les informations que vous nous avez transmises, vous
          êtes éligible au pass Sport."
          // todo: Enable later in august
          // buttonProps={{
          //   children: "Accéder au formulaire d'obtention du pass Sport",
          //   onClick: () => {
          //     trackRedirectionToPassSportForm();
          //     router.push('test-eligibilite');
          //   },
          // }}
          isSuccess
        >
          <p className={cn('fr-text--lg', rootStyles['text--medium'], rootStyles['text--black'])}>
            Il vous permettra de déduire {PASS_SPORT_AMOUNT} euros sur l&apos;inscription prise
            entre le 1er septembre et le 31 décembre 2025, parmi plus de 59 000 clubs, associations
            sportives et salles de sport partenaires.
          </p>
        </VerdictPanel>
      )}

      {isValidated && confirmed === false && <FullNegativeVerdictPanel isLean />}
    </div>
  );
};

export default AgeStep2;
