import Select, {
  AriaGuidanceProps,
  AriaOnChangeProps,
  AriaOnFilterProps,
  AriaOnFocusProps,
  components,
  GroupBase,
  OptionsOrGroups,
  Props as ReactSelectProps,
} from 'react-select';
import styles from './styles.module.scss';
import React from 'react';

export const selectStyles = {
  control: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    flexGrow: 1,
    borderColor: '#ffffff',
    backgroundColor: '#eeeeee',
    padding: '0px 12px',
    borderBottom: '2px solid #3A3A3A',
  }),
  indicatorSeparator: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    backgroundColor: '#ffffff',
  }),
  valueContainer: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    paddingLeft: '0px',
  }),
  menu: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    zIndex: 999,
  }),
  input: () => {
    // We don't need the base style otherwise it messes up the placeholder visuals
    return {
      maxWidth: '140px',
      width: '140px',
    };
  },
};

export const guidance = (props: AriaGuidanceProps) => {
  const { tabSelectsValue, context, isInitialFocus } = props;
  switch (context) {
    case 'menu':
      return `Utiliser les flèches Haut et Bas pour choisir une option. La liste des clubs sera mise à jour quand l'option sera sélectionnée; Presser la touche entrer pour sélectionner l'option qui a le focus; Presser la touche Echap pour quitter la liste déroulante ${
        tabSelectsValue
          ? "; Pressez la touche Tab pour sélectionner l'option et quitter la liste déroulante"
          : ''
      }.`;
    case 'input':
      return isInitialFocus
        ? `la liste a le focus; Ecrivez pour affiner la liste; Appuyer sur la flèche bas pour ouvrir la liste déroulante`
        : '';
    case 'value':
      return 'Use left and right to toggle between focused values, press Backspace to remove the currently focused value';
    default:
      return '';
  }
};

export const onChange = <Option, IsMulti extends boolean>(
  props: AriaOnChangeProps<Option, IsMulti>,
) => {
  const { action, label = '', labels, isDisabled } = props;
  switch (action) {
    case 'deselect-option':
    case 'pop-value':
    case 'remove-value':
      return `L'option ${label} est déselectionnée`;
    case 'clear':
      return 'Toutes les options séléctionnées ont été effacées';
    case 'initial-input-focus':
      return `L'option ${labels.join(',')} est sélectionnée; `;
    case 'select-option':
      return isDisabled
        ? `L'option ${label} est désactivée. Selectionner une autre option.`
        : `L'option ${label} est sélectionnée`;
    default:
      return '';
  }
};

export const onFilter = (props: AriaOnFilterProps) => {
  const { inputValue, resultsMessage } = props;
  return `${resultsMessage}${inputValue ? ' pour le terme recherché ' + inputValue : ''}.`;
};

// Needed to override text translation "of" to "sur"
export const onFocus = <Option, Group extends GroupBase<Option>>(
  props: AriaOnFocusProps<Option, Group>,
) => {
  const {
    context,
    focused,
    options,
    label = '',
    selectValue,
    isDisabled,
    isSelected,
    isAppleDevice,
  } = props;

  const getArrayIndex = (arr: OptionsOrGroups<Option, Group>, item: Option) =>
    arr && arr.length ? `${arr.indexOf(item) + 1} sur ${arr.length}` : '';

  if (context === 'value' && selectValue) {
    return `valeur ${label} sélectionné, ${getArrayIndex(selectValue, focused)}.`;
  }

  if (context === 'menu' && isAppleDevice) {
    const disabled = isDisabled ? ' disabled' : '';
    const status = `${isSelected ? ' sélectionné' : ''}${disabled}`;
    return `${label}${status}, ${getArrayIndex(options, focused)}.`;
  }

  return '';
};

export const customScreenReaderStatus = ({ count }: { count: number }) =>
  `${count} résultat${count !== 1 ? 's' : ''} disponible${count !== 1 ? 's' : ''}`;

// Create Input component to override & fix the cursor issue in order to select the input's value
export const createCustomInput = (placeholder: string, ariaDescribedby?: string) => {
  const CustomInput: typeof components.Input = (props) => {
    // isHidden property set to false is important, it is to display the input value (it is initially hidden with opacity: 0)
    return (
      <components.Input
        {...props}
        isHidden={false}
        placeholder={placeholder}
        className={styles['placeholder-wrapper']}
        {...(ariaDescribedby && { 'aria-describedby': ariaDescribedby })}
      />
    );
  };

  return CustomInput;
};

// Override the built-in Placeholder, it was used as a placeholder in a div instead of inside the input[placeholder]
export const CustomPlaceholder: typeof components.Placeholder = (props) => {
  return <></>;
};

function CustomSelect<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>(props: ReactSelectProps<Option, IsMulti, Group>) {
  const { styles, screenReaderStatus, ...otherProps } = props;

  return (
    <Select
      ariaLiveMessages={{
        guidance,
        onChange,
        onFilter,
        onFocus,
      }}
      styles={selectStyles}
      screenReaderStatus={customScreenReaderStatus}
      {...otherProps}
    />
  );
}

export default CustomSelect;
