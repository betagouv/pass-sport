import Tile, { TileProps } from '@codegouvfr/react-dsfr/Tile';
import styles from './styles.module.scss';

type MainTilesProps = {
  titleAs: TileProps['titleAs'];
};

export default function MainTiles({ titleAs }: MainTilesProps) {
  return (
    <section className={styles.tiles}>
      <Tile
        title="Je suis un particulier"
        desc="Jeune ou parent"
        orientation="horizontal"
        imageUrl="/images/homepage/avatar.svg"
        imageAlt=""
        linkProps={{
          href: '/v2/jeune-ou-parent',
        }}
        titleAs={titleAs}
      />
      <Tile
        title="Je suis une structure"
        desc="Club, asso ou salle de sport"
        orientation="horizontal"
        imageUrl="/images/homepage/location-overseas-france.svg"
        imageAlt=""
        linkProps={{
          href: '/v2/structure',
        }}
        titleAs={titleAs}
      />
    </section>
  );
}
