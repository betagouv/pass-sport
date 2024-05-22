import styles from './styles.module.scss';
import rootStyles from '../../styles.module.scss';
import SocialMediaLinks from '../socialMediaLinks/SocialMediaLinks';
import Actions from '../actions/Actions';
import { CallOut } from '@codegouvfr/react-dsfr/CallOut';
import Button, { ButtonProps } from '@codegouvfr/react-dsfr/Button';
import { ReactNode } from 'react';
import Link from 'next/link';
import cn from 'classnames';

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
    <div>
      <div
        className={cn(styles.background, { 'fr-p-2w': !isLean, [`${styles.bordered}`]: !isLean })}
      >
        <div
          className={cn('fr-callout', 'fr-icon-information-line', {
            'fr-callout--green-emeraude': isSuccess,
            'fr-callout--pink-tuile': !isSuccess,
          })}
        >
          <h3 className={cn('fr-callout__title', 'fr-pb-1w')}>{title}</h3>
          <div>{children}</div>

          {buttonProps && <Button {...buttonProps} />}
        </div>

        {qrCodeComponent}

        {hasSocialLinks && <SocialMediaLinks />}
      </div>

      <div className="fr-mb-3w fr-mt-10v">
        <Actions />
      </div>

      <div className={cn(styles.background, { 'fr-p-2w': !isLean })}>
        <div className="fr-callout fr-icon-information-line fr-callout--blue-ecume">
          <h3 className={cn('fr-callout__title', 'fr-pb-1w')}>
            Pour vous engager dans des missions de volontariat ou de bénévolat :
          </h3>
          <div>
            <p className={cn('fr-mb-2w', 'fr-callout__text', rootStyles['text--title-grey'])}>
              <span className="fr-text--bold">
                Le SNU, pour moi, pour les autres, et pour la France.
              </span>{' '}
              Agir très concrètement pour une société plus solidaire
            </p>
            <Link className="fr-link" target="_blank" href="https://www.snu.gouv.fr/">
              SNU.gouv.fr
            </Link>
            <p
              className={cn(
                'fr-mt-4w',
                'fr-mb-2w',
                'fr-callout__text',
                rootStyles['text--title-grey'],
              )}
            >
              <span className="fr-text--bold">
                Le Service Civique, une mission pour chacun au service de tous.
              </span>{' '}
              Vous souhaitez être volontaire ? <br />
              Découvrez les 7 233 missions en ligne
            </p>
            <Link className="fr-link" target="_blank" href="https://www.service-civique.gouv.fr/">
              Service-civique.gouv.fr
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerdictPanel;
