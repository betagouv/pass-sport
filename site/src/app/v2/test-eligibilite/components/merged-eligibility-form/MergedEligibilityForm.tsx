import Input from '@codegouvfr/react-dsfr/Input';
import Select from '@codegouvfr/react-dsfr/Select';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import {
  ChangeEvent,
  FocusEvent,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { push } from '@socialgouv/matomo-next';
import {
  EligibilityFieldName,
  EligibilityFormInputsState,
  LCA_SITUATION,
  SituationType,
} from '@/types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import CityFinder from '../city-finder/CityFinder';
import CustomInput from '../custom-input/CustomInput';
import ErrorAlert from '../error-alert/ErrorAlert';
import CommonInputs from './common-inputs/CommonInputs';
import FormButton from './FormButton';
import { mapper } from '../../helpers/helper';
import { submitEligibilityRequest } from '../../agent';
import { CAF, CROUS, MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';
import { CAISSE } from '@/utils/eligibility-test';
import { FRANCE_ISO_CODE } from '../../helpers/countries';
import { formDefaultsFor } from '../../helpers/test-defaults';
import styles from './styles.module.scss';

const BENEFICIARY_FIELDS: EligibilityFieldName[] = [
  'beneficiaryLastname',
  'beneficiaryFirstname',
  'recipientResidencePlace',
];

const initialInputsState: EligibilityFormInputsState = {
  beneficiaryLastname: { state: 'default' },
  beneficiaryFirstname: { state: 'default' },
  recipientResidencePlace: { state: 'default' },
  recipientLastname: { state: 'default' },
  recipientFirstname: { state: 'default' },
  recipientGenre: { state: 'default' },
  recipientCafNumber: { state: 'default' },
  recipientIneNumber: { state: 'default' },
  recipientBirthDate: { state: 'default' },
  recipientBirthCountry: { state: 'default' },
  recipientBirthPlace: { state: 'default' },
  email: { state: 'default' },
};

const CAF_NUMBER_ERROR = (
  <>
    Le numéro&nbsp; <CAF /> &nbsp;doit être composé de 7 chiffres
  </>
);

const EMAIL_ERROR = 'Saisissez une adresse électronique valide';

const BOURSIER_IDENTIFICATION_ERROR =
  'Renseignez votre numéro INE, ou à défaut vos pays et commune de naissance.';

/* Single source of truth for the field rules, shared by the blur handler and the submit validation */
const getFieldError = (
  field: EligibilityFieldName,
  value: string,
  isRequired: boolean,
): ReactNode | null => {
  if (!value) {
    return isRequired ? mapper[field] : null;
  }

  if (field === 'recipientCafNumber' && !/^\d{7}$/.test(value)) {
    return CAF_NUMBER_ERROR;
  }

  if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return EMAIL_ERROR;
  }

  return null;
};

/* The allowance already determines the situation the API will answer with */
const getExpectedSituation = (allowance: ALLOWANCE | null): SituationType | null => {
  switch (allowance) {
    case ALLOWANCE.QF:
    case ALLOWANCE.AEEH:
      return LCA_SITUATION.JEUNE;
    case ALLOWANCE.AAH:
      return LCA_SITUATION.AAH;
    case ALLOWANCE.CROUS:
    case ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX:
      return LCA_SITUATION.BOURSIER;
    default:
      return null;
  }
};

/**
 * Every field required on screen for this branch. Boursiers are the exception: an INE
 * identifies the student outright, so it stands in for the pays et commune de naissance,
 * and vice versa.
 */
const getRequiredFields = (
  situation: SituationType | null,
  caisse: CAISSE | null,
  formData: FormData,
): EligibilityFieldName[] => {
  const fields: EligibilityFieldName[] = [...BENEFICIARY_FIELDS, 'recipientGenre', 'email'];
  const bornInFrance = (formData.get('recipientBirthCountry') ?? '').toString() === FRANCE_ISO_CODE;

  if (situation === LCA_SITUATION.BOURSIER) {
    const hasIne = !!(formData.get('recipientIneNumber') ?? '').toString().trim();

    if (!hasIne) {
      fields.push('recipientBirthCountry');
      if (bornInFrance) fields.push('recipientBirthPlace');
    }

    return fields;
  }

  fields.push(
    'recipientLastname',
    'recipientFirstname',
    'recipientBirthDate',
    'recipientBirthCountry',
  );

  // The birthplace is only asked for, and only accepted by the API, when the country is France
  if (bornInFrance) fields.push('recipientBirthPlace');
  if (caisse === CAISSE.CAF) fields.push('recipientCafNumber');

  return fields;
};

const MergedEligibilityForm = () => {
  const { allowance, caisse, dob, portalNode } = useContext(EligibilityTestContext);

  const formRef = useRef<HTMLFormElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const [inputStates, setInputStates] = useState<EligibilityFormInputsState>(initialInputsState);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);
  const [error, setError] = useState<string | null>();
  const [outcome, setOutcome] = useState<'queued' | 'already_queued' | null>(null);
  // Masked address the previous request went to, when there was one.
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Unmasked, because it is the address this visitor just typed: naming it is what lets them
  // catch their own typo before waiting on a link that will never arrive.
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const defaults = formDefaultsFor(allowance, caisse);
  const [isBirthPlaceRequired, setIsBirthPlaceRequired] = useState<boolean>(
    defaults?.recipientBirthCountry === FRANCE_ISO_CODE,
  );

  // Submitting unmounts the submit button, so focus would fall back to the document: move it
  // onto the outcome instead, which also guarantees the message is read out.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  const situation = getExpectedSituation(allowance);
  const isBoursier = situation === LCA_SITUATION.BOURSIER;
  const isCaf = caisse === CAISSE.CAF;

  const setFieldState = (field: EligibilityFieldName, hasValue: unknown) => {
    setInputStates((states) => ({
      ...states,
      [field]: hasValue ? { state: 'default' } : { state: 'error', errorMsg: mapper[field] },
    }));
  };

  const isRequiredOnBlur = (field: EligibilityFieldName, formData: FormData): boolean => {
    if (getRequiredFields(situation, caisse, formData).includes(field)) {
      return true;
    }

    if (!isBoursier) {
      return false;
    }

    const hasIne = !!(formData.get('recipientIneNumber') ?? '').toString().trim();
    const hasCountry = !!(formData.get('recipientBirthCountry') ?? '').toString().trim();

    switch (field) {
      case 'recipientIneNumber':
        return !hasCountry;
      case 'recipientBirthCountry':
        return !hasIne;
      default:
        return false;
    }
  };

  const onFieldBlur =
    (field: EligibilityFieldName) => (e: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      const form = e.currentTarget.form;
      const formData = form ? new FormData(form) : new FormData();
      const errorMsg = getFieldError(
        field,
        e.target.value.trim(),
        isRequiredOnBlur(field, formData),
      );

      setInputStates((states) => ({
        ...states,
        [field]: errorMsg ? { state: 'error', errorMsg } : { state: 'default' },
      }));
    };

  /**
   * A boursier gives either an INE or a pays de naissance. Answering one makes the other optional,
   * so drop the error blur may have left on it while it still counted as required.
   */
  const clearIneOrBirthCountryError = (answeredField: EligibilityFieldName, value: string) => {
    if (!isBoursier || !value) return;

    const fieldToClear =
      answeredField === 'recipientIneNumber' ? 'recipientBirthCountry' : 'recipientIneNumber';

    setInputStates((states) => ({ ...states, [fieldToClear]: { state: 'default' } }));
  };

  const focusFirstError = (states: EligibilityFormInputsState, fields: EligibilityFieldName[]) => {
    const firstInvalid = fields.find((field) => states[field].state === 'error');

    if (!firstInvalid) return;

    formRef.current
      ?.querySelector<HTMLInputElement>(`[name="${firstInvalid}"], #${firstInvalid}`)
      ?.focus();
  };

  const validate = (
    formData: FormData,
    fields: EligibilityFieldName[],
  ): { isValid: boolean; states: EligibilityFormInputsState } => {
    let isValid = true;
    const states = structuredClone(initialInputsState);

    fields.forEach((field) => {
      const errorMsg = getFieldError(field, (formData.get(field) ?? '').toString().trim(), true);

      if (errorMsg) {
        states[field] = { state: 'error', errorMsg };
        isValid = false;
      }
    });

    return { isValid, states };
  };

  const notifyError = (message = 'Une erreur a eu lieu. Merci de réessayer plus tard') => {
    setError(message);
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(formRef.current!);
    const required = getRequiredFields(situation, caisse, formData);

    const check = validate(formData, required);
    setInputStates(check.states);

    if (!check.isValid) {
      focusFirstError(check.states, required);
      return;
    }

    // getRequiredFields drops the birth country as soon as an INE is present, so a boursier
    // who answered neither passes the check above.
    if (
      isBoursier &&
      !(formData.get('recipientIneNumber') ?? '').toString().trim() &&
      !(formData.get('recipientBirthCountry') ?? '').toString().trim()
    ) {
      notifyError(BOURSIER_IDENTIFICATION_ERROR);
      return;
    }

    // Answered in step 1, so they live in context rather than in an input.
    formData.set('beneficiaryBirthDate', dob ?? '');
    if (allowance) formData.set('allowanceName', allowance);
    if (caisse) formData.set('caisse', caisse);

    const { status, body } = await submitEligibilityRequest(formData);

    if (status !== 202 && status !== 409) {
      notifyError();
      push([
        'trackEvent',
        'Eligibility Test',
        'Eligibility test completed',
        'Eligibility test submission failed',
      ]);
      return;
    }

    // 409 means this exact request is already in the queue. Nothing went wrong, but it is
    // said out loud rather than dressed up as a fresh submission: someone who resubmits
    // deserves to know their first attempt is still on its way.
    const alreadyQueued = status === 409;

    setIsFormDisabled(true);
    setSentTo(body.sentTo ?? null);
    setVerificationEmail((formData.get('email') ?? '').toString().trim() || null);
    setOutcome(alreadyQueued ? 'already_queued' : 'queued');
    push([
      'trackEvent',
      'Eligibility Test',
      'Eligibility test completed',
      alreadyQueued
        ? 'Eligibility test request already queued'
        : 'Eligibility test verification email sent',
    ]);
  };

  const onCountryChanged = (e: ChangeEvent<HTMLSelectElement>) => {
    setIsBirthPlaceRequired(e.target.value.toUpperCase() === FRANCE_ISO_CODE);
    setFieldState('recipientBirthCountry', e.target.value);
    clearIneOrBirthCountryError('recipientBirthCountry', e.target.value);
  };

  const getNameLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Nom de famille de l&apos;enfant ou du jeune adulte bénéficiaire{' '}
            <span className="text--required">*</span>{' '}
          </>
        );
      case ALLOWANCE.AEEH:
      case ALLOWANCE.QF:
        return (
          <>
            Nom de famille de l&apos;enfant <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Nom de famille <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  const getFirstnameLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Prénom l&apos;enfant ou du jeune adulte bénéficiaire{' '}
            <span className="text--required">*</span>{' '}
          </>
        );
      case ALLOWANCE.AEEH:
      case ALLOWANCE.QF:
        return (
          <>
            Prénom de l&apos;enfant <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Prénom <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  const getResidencePlaceLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
      case ALLOWANCE.QF:
        return (
          <>
            Commune de résidence de l’allocataire <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Commune de résidence <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  const caisseAcronym = isCaf ? <CAF /> : <MSA />;

  /* Boursiers are their own beneficiary, so they get the bare wording, as CommonInputs already does */
  const genreField = (
    <Select
      label={
        <>
          {isBoursier ? 'Genre' : 'Genre de l’allocataire'}{' '}
          <span className="text--required">*</span>
        </>
      }
      state={inputStates.recipientGenre.state}
      stateRelatedMessage={inputStates.recipientGenre.errorMsg}
      disabled={isFormDisabled}
      nativeSelectProps={{
        name: 'recipientGenre',
        defaultValue: defaults?.recipientGenre ?? '',
        required: true,
        onBlur: onFieldBlur('recipientGenre'),
        onChange: (e: ChangeEvent<HTMLSelectElement>) =>
          setFieldState('recipientGenre', e.target.value),
        'aria-label': isBoursier ? 'Saisir votre genre' : "Saisir le genre de l'allocataire",
      }}
    >
      <option value="" disabled hidden>
        Selectionnez une option
      </option>
      <option value="F">Féminin</option>
      <option value="M">Masculin</option>
    </Select>
  );

  const firstnameField = (
    <Input
      label={getFirstnameLabel()}
      state={inputStates.beneficiaryFirstname.state}
      stateRelatedMessage={inputStates.beneficiaryFirstname.errorMsg}
      disabled={isFormDisabled}
      nativeInputProps={{
        name: 'beneficiaryFirstname',
        defaultValue: defaults?.beneficiaryFirstname,
        onBlur: onFieldBlur('beneficiaryFirstname'),
        onChange: (e: ChangeEvent<HTMLInputElement>) =>
          setFieldState('beneficiaryFirstname', e.target.value),
        autoComplete: 'given-name',
        'aria-autocomplete': 'none',
        required: true,
      }}
      hintText={
        <>
          Format attendu : Prénom tel qu’il est écrit sur vos papiers{' '}
          {isBoursier ? (
            <>
              du <CROUS />
            </>
          ) : (
            <>de la {caisseAcronym}</>
          )}
          .
        </>
      }
    />
  );

  return (
    <>
      <p className="fr-mb-2w fr-ml-n1w">
        Ces informations nous aideront à faire valoir vos droits.
      </p>

      <form ref={formRef} onSubmit={onSubmitHandler}>
        <Input
          label={getNameLabel()}
          state={inputStates.beneficiaryLastname.state}
          stateRelatedMessage={inputStates.beneficiaryLastname.errorMsg}
          disabled={isFormDisabled}
          nativeInputProps={{
            name: 'beneficiaryLastname',
            defaultValue: defaults?.beneficiaryLastname,
            onBlur: onFieldBlur('beneficiaryLastname'),
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setFieldState('beneficiaryLastname', e.target.value),
            autoComplete: 'family-name',
            'aria-autocomplete': 'none',
            required: true,
            autoFocus: true,
          }}
          hintText={
            <>
              Format attendu : Nom tel qu’il est écrit sur vos papiers{' '}
              {isBoursier ? (
                <>
                  du <CROUS />
                </>
              ) : (
                <>de la {caisseAcronym}</>
              )}
              .
            </>
          }
        />

        {/* A boursier has no allocataire, so the genre describes them and is asked here rather
            than in the allocataire block — stacked above the prénom, not beside it, so the
            column order does not change what a screen reader announces between nom and prénom */}
        {isBoursier ? (
          <>
            {genreField}
            {firstnameField}
          </>
        ) : (
          firstnameField
        )}

        <CityFinder
          legend={getResidencePlaceLabel()}
          isDisabled={isFormDisabled}
          inputName="recipientResidencePlace"
          defaultOption={defaults?.recipientResidencePlace}
          inputState={inputStates.recipientResidencePlace}
          onChanged={(text) => setFieldState('recipientResidencePlace', text)}
          onBlur={(text) => setFieldState('recipientResidencePlace', text)}
          required
        />

        {isBoursier && (
          <>
            <CustomInput
              inputProps={{
                label:
                  allowance === ALLOWANCE.CROUS ? (
                    <>
                      Numéro INE provenant du <CROUS />
                    </>
                  ) : (
                    <>Numéro INE provenant des formations sanitaires et sociales</>
                  ),
                hintText:
                  'Format attendu : composé de 11 caractères, soit 10 chiffres et 1 lettre soit 9 chiffres et 2 lettres',
                nativeInputProps: {
                  name: 'recipientIneNumber',
                  placeholder: 'ex: 0000000000X ou 00000000XX',
                  type: 'text',
                  onBlur: onFieldBlur('recipientIneNumber'),
                  onChange: (e: ChangeEvent<HTMLInputElement>) => {
                    setFieldState('recipientIneNumber', e.target.value);
                    clearIneOrBirthCountryError('recipientIneNumber', e.target.value);
                  },
                  'aria-label': 'Saisir le numéro INE',
                },
                state: inputStates.recipientIneNumber.state,
                stateRelatedMessage: inputStates.recipientIneNumber.errorMsg,
                disabled: isFormDisabled,
              }}
              secondHint="Si vous ne disposez pas de numéro INE, renseignez vos pays et commune de naissance ci-dessous."
            />

            <CommonInputs
              birthCountryInputName="recipientBirthCountry"
              birthPlaceInputName="recipientBirthPlace"
              inputStates={inputStates}
              areInputsDisabled={isFormDisabled}
              isBirthInputRequired={isBirthPlaceRequired}
              onCountryChanged={onCountryChanged}
              onCountryBlur={onFieldBlur('recipientBirthCountry')}
              onBirthPlaceChanged={(text) => setFieldState('recipientBirthPlace', text)}
              isDirectBeneficiary
              shouldAutoFocus={false}
              isCountryRequired={false}
              countryLabel="Pays de naissance"
              birthPlaceLabel="Commune de naissance"
            />
          </>
        )}

        {!isBoursier && (
          <>
            <Input
              label={
                <>
                  Nom de l’allocataire {caisseAcronym} <span className="text--required">*</span>
                </>
              }
              state={inputStates.recipientLastname.state}
              stateRelatedMessage={inputStates.recipientLastname.errorMsg}
              disabled={isFormDisabled}
              nativeInputProps={{
                name: 'recipientLastname',
                defaultValue: defaults?.recipientLastname,
                placeholder: 'ex: Dupont',
                'aria-label': "Saisir le nom de l'allocataire",
                required: true,
                onBlur: onFieldBlur('recipientLastname'),
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setFieldState('recipientLastname', e.target.value),
              }}
              hintText={
                <>
                  Format attendu : Nom de l&apos;allocataire tel qu&apos;il est écrit sur vos
                  papiers de la {caisseAcronym}.
                </>
              }
            />

            <Input
              label={
                <>
                  Prénom de l’allocataire {caisseAcronym} <span className="text--required">*</span>
                </>
              }
              state={inputStates.recipientFirstname.state}
              stateRelatedMessage={inputStates.recipientFirstname.errorMsg}
              disabled={isFormDisabled}
              nativeInputProps={{
                name: 'recipientFirstname',
                defaultValue: defaults?.recipientFirstname,
                placeholder: 'ex: Marie',
                'aria-label': "Saisir le prénom de l'allocataire",
                required: true,
                onBlur: onFieldBlur('recipientFirstname'),
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setFieldState('recipientFirstname', e.target.value),
              }}
              hintText={
                <>
                  Format attendu : Prénom de l&apos;allocataire tel qu&apos;il est écrit sur vos
                  papiers de la {caisseAcronym}.
                </>
              }
            />

            {genreField}
          </>
        )}

        {!isBoursier && isCaf && (
          <CustomInput
            inputProps={{
              label: (
                <>
                  Numéro de l’allocataire <CAF /> <span className="text--required">*</span>
                </>
              ),
              hintText: 'Personne responsable du compte de l’allocation.',
              nativeInputProps: {
                name: 'recipientCafNumber',
                defaultValue: defaults?.recipientCafNumber,
                placeholder: 'Exemple : 0123456',
                type: 'text',
                required: true,
                onBlur: onFieldBlur('recipientCafNumber'),
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setFieldState('recipientCafNumber', e.target.value),
                'aria-label': "Saisir le numéro de l'allocataire CAF",
              },
              state: inputStates.recipientCafNumber.state,
              stateRelatedMessage: inputStates.recipientCafNumber.errorMsg,
              disabled: isFormDisabled,
            }}
            secondHint={
              <>
                Aussi appelé « numéro de dossier ». Le numéro figure en haut à gauche de tous les
                courriers émis par la <CAF /> ainsi que sur toutes les attestations que vous pouvez
                télécharger depuis votre espace personnel.
              </>
            }
          />
        )}

        {/* Asked for every caisse, not just the MSA: it is part of the identité pivot the
            quotient familial and AAH endpoints are queried on. */}
        {!isBoursier && (
          <Input
            label={
              <>
                Date de naissance de l’allocataire <span className="text--required">*</span>
              </>
            }
            hintText="Exemple : 31/12/1980."
            state={inputStates.recipientBirthDate.state}
            stateRelatedMessage={inputStates.recipientBirthDate.errorMsg}
            disabled={isFormDisabled}
            nativeInputProps={{
              name: 'recipientBirthDate',
              defaultValue: defaults?.recipientBirthDate,
              type: 'date',
              min: '1900-01-01',
              max: '2099-12-31',
              required: true,
              onBlur: onFieldBlur('recipientBirthDate'),
              'aria-label': "Saisir la date de naissance de l'allocataire",
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                setFieldState('recipientBirthDate', e.target.value),
            }}
          />
        )}

        {!isBoursier && (
          <CommonInputs
            birthCountryInputName="recipientBirthCountry"
            birthPlaceInputName="recipientBirthPlace"
            inputStates={inputStates}
            areInputsDisabled={isFormDisabled}
            isBirthInputRequired={isBirthPlaceRequired}
            onCountryChanged={onCountryChanged}
            onCountryBlur={onFieldBlur('recipientBirthCountry')}
            onBirthPlaceChanged={(text) => setFieldState('recipientBirthPlace', text)}
            shouldAutoFocus={false}
            defaultBirthCountry={defaults?.recipientBirthCountry}
            defaultBirthPlace={defaults?.recipientBirthPlace}
          />
        )}

        <Input
          label={
            <>
              Adresse électronique <span className="text--required">*</span>
            </>
          }
          className="fr-mt-2w"
          hintText="C’est à cette adresse que votre code pass Sport sera envoyé. Exemple : nom@domaine.fr"
          state={inputStates.email.state}
          stateRelatedMessage={inputStates.email.errorMsg}
          disabled={isFormDisabled}
          nativeInputProps={{
            name: 'email',
            defaultValue: defaults?.email,
            type: 'email',
            required: true,
            autoComplete: 'email',
            onBlur: onFieldBlur('email'),
            onChange: (e: ChangeEvent<HTMLInputElement>) => setFieldState('email', e.target.value),
            'aria-label': 'Saisir votre adresse électronique',
          }}
        />

        {!outcome && <FormButton isDisabled={isFormDisabled} />}
      </form>

      {error && (
        <div className="fr-mt-4w">
          <ErrorAlert title={error} />
        </div>
      )}

      {portalNode &&
        createPortal(
          <div className={styles.outcome}>
            {outcome && (
              <div className="fr-mt-6w" ref={outcomeRef} tabIndex={-1}>
                <Alert
                  role="status"
                  severity={outcome === 'queued' ? 'success' : 'info'}
                  title={
                    outcome === 'queued' ? 'Confirmez votre adresse' : 'Demande déjà enregistrée'
                  }
                  description={
                    <>
                      <p className="fr-mb-1w">
                        {outcome === 'queued' ? (
                          <>
                            Un courriel vient d’être envoyé
                            {verificationEmail ? (
                              <>
                                {' '}
                                à <strong>{verificationEmail}</strong>
                              </>
                            ) : null}
                            . Ouvrez le lien qu’il contient pour lancer la vérification de vos
                            droits&nbsp;: tant que ce lien n’est pas ouvert, votre demande n’est pas
                            traitée.
                          </>
                        ) : sentTo ? (
                          'Cette demande nous est déjà parvenue et a été traitée.'
                        ) : (
                          'Cette demande nous est déjà parvenue et son traitement est en cours.'
                        )}
                      </p>
                      {outcome === 'queued' && (
                        <p className="fr-mb-1w">Ce lien est valable 24&nbsp;heures.</p>
                      )}
                      {sentTo && (
                        <p className="fr-mb-1w">
                          Le résultat a été envoyé à <strong>{sentTo}</strong>. L’adresse est
                          partiellement masquée&nbsp;; elle sert seulement à vous rappeler quelle
                          boîte consulter.
                        </p>
                      )}
                      <p className="fr-mb-0">
                        Pensez à vérifier vos courriers indésirables si vous ne trouvez pas le
                        courriel.
                      </p>
                    </>
                  }
                />
              </div>
            )}
          </div>,
          portalNode,
        )}
    </>
  );
};

export default MergedEligibilityForm;
