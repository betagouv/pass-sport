import styles from './styles.module.scss';
import SocialMediaLinks from '../socialMediaLinks/SocialMediaLinks';
import Actions from '../actions/Actions';
import Button, { ButtonProps } from '@codegouvfr/react-dsfr/Button';
import { ReactNode } from 'react';
import cn from 'classnames';
import MissionCards from '../mission-cards/MissionCards';

interface Props {
  title: string;
  buttonProps?: ButtonProps;
  isSuccess: boolean;
  hasSocialLinks?: boolean;
  children: ReactNode;
  isLean?: boolean;
  qrCodeComponent?: ReactNode;
}

const VerdictPanel = ({
  title,
  buttonProps,
  children,
  isSuccess,
  hasSocialLinks = true,
  isLean = false,
  qrCodeComponent,
}: Props) => {
  return (
    <>
      <div
        role="alert"
        className={cn(styles.background, { 'fr-p-2w': !isLean, [`${styles.bordered}`]: !isLean })}
      >
        <div
          className={cn('fr-callout', 'fr-icon-information-line', {
            'fr-callout--green-emeraude': isSuccess,
            'fr-callout--pink-tuile': !isSuccess,
          })}
        >
          <h2 className={cn('fr-callout__title', 'fr-pb-1w', 'fr-h3')}>{title}</h2>
          <div>{children}</div>

          {buttonProps && <Button {...buttonProps} />}
        </div>

        {qrCodeComponent}

        <div className="fr-mb-1w">
          <Actions />
        </div>

        <div className="fr-mb-8w">{hasSocialLinks && <SocialMediaLinks />}</div>
      </div>

      <div className={cn(styles.background, { 'fr-p-2w': !isLean })}>
        <MissionCards isUsingSuccessUrls={isSuccess} />
      </div>
    </>
  );
};

export default VerdictPanel;
