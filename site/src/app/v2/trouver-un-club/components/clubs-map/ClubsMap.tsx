'use client';

import { MapContainer, TileLayer, Circle, ZoomControl } from 'react-leaflet';
import { LatLngLiteral } from 'leaflet';
import styles from './styles.module.scss';
import { ExportedClub } from '@/types/Club';
import Clusterizer from './Clusterizer';
import MapEventHandler from './MapEventHandler';
import { useLeafletAccessibility } from '@/app/hooks/useLeafletAccessibility';
import { useRef } from 'react';
import MapZoomHandler from './MapZoomHandler';

interface Props {
  clubs: ExportedClub[];
  centerPosition?: LatLngLiteral;
  userPosition?: LatLngLiteral;
  distance: number;
  zoom: number;
}

const ClubsMap: React.FC<Props> = ({ clubs, centerPosition, userPosition, distance, zoom }) => {
  const ref = useRef(null);
  useLeafletAccessibility(ref);

  return (
    <div ref={ref}>
      <MapContainer
        className={`fr-mx-auto ${styles.map}`}
        center={centerPosition}
        zoom={zoom}
        scrollWheelZoom={false}
        maxZoom={25}
        minZoom={3}
        zoomControl={false}
      >
        <MapEventHandler />
        <MapZoomHandler />

        <Clusterizer clubs={clubs} />

        {userPosition && <Circle center={[userPosition.lat, userPosition.lng]} radius={distance} />}
        <ZoomControl zoomInTitle="Zoomer" zoomOutTitle="Dézoomer" />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; contributeurs <a target="_blank" aria-label="Ouvrir openstreetmap.org dans une nouvelle fenêtre" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
      </MapContainer>
    </div>
  );
};

export default ClubsMap;
