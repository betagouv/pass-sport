import styles from './styles.module.scss';
import rootStyles from '../../styles.module.scss';
import { socialMedia } from '@/app/constants/social-media';
import cn from 'classnames';

const SocialMediaLinks = () => {
  return (
    <div>
      <p
        className={cn(
          'fr-text--lg',
          'fr-mb-0',
          rootStyles['text--medium'],
          rootStyles['text--black'],
        )}
      >
        Pour plus d&apos;informations, suivez-nous sur les réseaux sociaux :
      </p>
      <div className={cn('fr-pt-3v', styles['link-container'])}>
        {socialMedia.map((media) => (
          <a
            key={media.id}
            className={cn('fr-link', media.iconClassName, 'fr-link--icon-left')}
            href={media.href}
            target="_blank"
          >
            {media.label}
          </a>
        ))}
      </div>
    </div>
  );
};

export default SocialMediaLinks;
