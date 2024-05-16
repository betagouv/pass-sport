import styles from './styles.module.scss';
import rootStyles from '../../styles.module.scss';
import SocialMediaLinks from '../socialMediaLinks/SocialMediaLinks';
import Actions from '../actions/Actions';
import { CallOut } from '@codegouvfr/react-dsfr/CallOut';
import { ButtonProps } from '@codegouvfr/react-dsfr/Button';
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
}

const VerdictPanel = ({
  title,
  buttonProps,
  children,
  isSuccess,
  hasSocialLinks = true,
  isLean = false,
}: Props) => {
  return (
    <div>
      <div
        className={cn(styles.background, { 'fr-p-2w': !isLean, [`${styles.bordered}`]: !isLean })}
      >
        <CallOut
          title={title}
          colorVariant={isSuccess ? 'green-emeraude' : 'pink-tuile'}
          classes={{
            title: `fr-px-1w fr-pt-1w ${styles['callout-title']}`,
            text: `fr-px-1w ${rootStyles['text--medium']}`,
          }}
          iconId="fr-icon-info-line"
          {...(buttonProps && { buttonProps })}
        >
          {children}
        </CallOut>
        {hasSocialLinks && <SocialMediaLinks />}
      </div>

      <div className="fr-mb-3w fr-mt-10v">
        <Actions />
      </div>

      <div className={cn(styles.background, { 'fr-p-2w': !isLean })}>
        <CallOut
          title="Pour vous engager dans des missions de volontariat ou de bénévolat :"
          colorVariant="blue-ecume"
          classes={{
            root: 'fr-mb-0 ',
            title: `fr-px-1w fr-pt-1w ${styles['callout-title']}`,
            text: `fr-px-1w ${rootStyles['text--medium']}`,
          }}
          iconId="fr-icon-info-line"
        >
          <p className={cn('fr-text--lg', 'fr-mb-2w', rootStyles['text--title-grey'])}>
            <span className="fr-text--bold">
              Le SNU, pour moi, pour les autres, et pour la France.
            </span>{' '}
            Agir très concrètement pour une société plus solidaire
          </p>
          <Link className="fr-link" target="_blank" href="https://www.snu.gouv.fr/">
            SNU.gouv.fr
          </Link>
          <p className={cn('fr-text--lg', 'fr-mt-4w', 'fr-mb-2w', rootStyles['text--title-grey'])}>
            <span className="fr-text--bold">
              Le Service Civique, une mission pour chacun au service de tous.
            </span>{' '}
            Vous souhaitez être volontaire ? Découvrez les 7 233 missions en ligne
          </p>
          <Link className="fr-link" target="_blank" href="https://www.service-civique.gouv.fr/">
            Service-civique.gouv.fr
          </Link>
        </CallOut>
      </div>
    </div>
  );
};

export default VerdictPanel;
