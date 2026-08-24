import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FocusEvent } from 'react';
import { InputState } from '@/types/form';

interface Props {
  inputState: InputState;
  isDisabled: boolean;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}

const RecipientEmailInput = ({ inputState, isDisabled, onChange, onBlur }: Props) => (
  <Input
    label={
      <>
        Votre adresse e-mail <span className="text--required">*</span>
      </>
    }
    hintText="Le résultat de votre demande y sera envoyé. Exemple : marie.dupont@exemple.fr"
    state={inputState.state}
    stateRelatedMessage={inputState.errorMsg}
    disabled={isDisabled}
    nativeInputProps={{
      name: 'recipientEmail',
      type: 'email',
      placeholder: 'ex: marie.dupont@exemple.fr',
      required: true,
      autoComplete: 'email',
      onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
      onBlur: (e: FocusEvent<HTMLInputElement>) => onBlur(e.target.value),
      'aria-label': 'Saisir votre adresse e-mail',
    }}
  />
);

export default RecipientEmailInput;
