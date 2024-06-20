import cn from 'classnames';
import styles from './styles.module.scss';

interface Props {
  isProVersion?: boolean;
}

const MissingClubInformationPanel = ({ isProVersion }: Props) => {
  return (
    <div
      className={cn('fr-alert', 'fr-alert--info', 'fr-mt-9w', 'fr-mx-auto', styles['alert-sizer'])}
    >
      <h6 className="fr-alert__title">Information</h6>
      <p>
        {isProVersion
          ? `Si votre club n'apparait pas, c'est qu'il n'est pas encore référencé. Dans ce cas là, n'hésitez pas à vous rapprocher de plusieurs interlocuteurs dans votre département en fonction de votre statut`
          : `Si mon club n’apparait pas, c’est qu’il n’accepte probablement pas encore le pass
        Sport. N’hésitez pas à vous rapprocher de votre club en lui proposant d’accepter le
        dispositif.`}
      </p>
    </div>
  );
};

export default MissingClubInformationPanel;
