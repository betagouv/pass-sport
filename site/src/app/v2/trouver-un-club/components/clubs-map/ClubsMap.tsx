'use client';

import { MapContainer, TileLayer, Circle } from 'react-leaflet';
import { LatLngLiteral } from 'leaflet';
import styles from './styles.module.scss';
import { ExportedClub } from 'types/Club';
import Clusterizer from './Clusterizer';
import MapEventHandler from './MapEventHandler';

interface Props {
  clubs: ExportedClub[];
  centerPosition?: LatLngLiteral;
  userPosition?: LatLngLiteral;
  distance: number;
  zoom: number;
}

const ClubsMap: React.FC<Props> = ({ clubs, centerPosition, userPosition, distance, zoom }) => {
  return (
    <MapContainer
      className={`fr-mx-auto ${styles.map}`}
      center={centerPosition}
      zoom={zoom}
      scrollWheelZoom={false}
      maxZoom={25}
      minZoom={3}
    >
      <MapEventHandler />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      <Clusterizer clubs={clubs} />

      {userPosition && <Circle center={[userPosition.lat, userPosition.lng]} radius={distance} />}
    </MapContainer>
  );
};

export default ClubsMap;
