import styles from '../styles.module.scss';
import Image from 'next/image';
import aboutImage from '@/images/tout-savoir-sur-le-pass-sport/about.webp';
import cn from 'classnames';
import CustomHighlight from '@/app/components/custom-highlight/CustomHighlight';

export default function About() {
  return (
    <>
      <section className={styles['about-container']}>
        <div className={styles['about-container__highlight']}>
          <div>
            <Image
              src={aboutImage}
              alt=""
              className={styles['about-container__highlight-image']}
              width={300}
              height={300}
            />
          </div>

          <div id="découvrir">
            <h2 className={cn(styles['about-container__highlight-title'], 'fr-h3')}>
              Qu&apos;est-ce que le pass Sport ?
            </h2>

            <CustomHighlight classes={[styles['about-container__highlight-text']]}>
              <p className="fr-mb-3w display--block">
                Le pass Sport est une aide de 50 euros qui permet de financer une partie de
                l&apos;inscription sportive à plus de 6,5 millions de jeunes. Il est valable dans
                plus de 85 000 clubs et salles de sport partenaires.
              </p>

              <p className="fr-mb-3w display--block">
                Le dispositif est porté par l&apos;État et déployé par le ministère des Sports, de
                la Jeunesse et de la Vie associative et permet de soutenir la pratique sportive de
                jeunes pendant l&apos;année sportive.
              </p>

              <p className="display--block">Il est ouvert du 1er juin au 31 décembre 2024.</p>
            </CustomHighlight>
          </div>
        </div>
      </section>

      <section className={cn(styles['about-sub-container'], 'fr-mx-auto', 'fr-px-2w')}>
        <div
          className={cn(
            styles['about-sub-container__highlight'],
            'fr-mx-auto',
            'fr-grid-row--center',
            'fr-mb-9w',
          )}
        >
          <CustomHighlight originalLeftBorder={false}>
            <>
              <p className="fr-mb-1w display--block">
                Le pass Sport est ouvert du 1er juin au 31 décembre 2024.
              </p>

              <p className="display--block">
                Pensez-bien à présenter votre pass à votre club avant la fin décembre 2024 !
              </p>
            </>
          </CustomHighlight>
        </div>
      </section>
    </>
  );
}
