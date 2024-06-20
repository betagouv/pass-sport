'use client';

import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import { LatLngLiteral } from 'leaflet';
import styles from './styles.module.scss';
import { ExportedClub } from 'types/Club';
import { getCenter } from 'geolib';
import L from 'leaflet';
import 'leaflet.markercluster/dist/leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './styles-marker-cluster.css';

interface Props {
  clubs: ExportedClub[];
  centerPosition?: LatLngLiteral;
  radius: number;
}

interface ClusterizerProps {
  clubs: ExportedClub[];
}

const Clusterizer: React.FC<ClusterizerProps> = ({ clubs }) => {
  const map = useMap();

  var markers = L.markerClusterGroup();

  clubs.forEach((club) => {
    const { geoloc_finale, nom } = club;
    if (geoloc_finale) {
      var marker = L.marker(new L.LatLng(geoloc_finale.lat, geoloc_finale.lon), { title: nom });

      const popup = L.popup().setContent(`
      <div>
        <p class='fr-text--lg fr-text--bold'> ${nom} </p> 
        <a class="fr-btn fr-btn--tertiary" href='trouver-un-club/${encodeURIComponent(nom)}'>
          Détails du club
        </a>
      </div>
      `);
      marker.bindPopup(popup);
      markers.addLayer(marker);
    }
  });

  map.addLayer(markers);
  return null;
};

const ClubsMap: React.FC<Props> = ({ clubs, centerPosition, radius }) => {
  const computeMapCenter = (): LatLngLiteral => {
    if (centerPosition) {
      return centerPosition;
    }

    const centerFromClubs = getCenter(
      clubs
        .filter((club) => club.geoloc_finale)
        .map((club) => ({ latitude: club.geoloc_finale!.lat, longitude: club.geoloc_finale!.lon })),
    );

    if (!centerFromClubs) {
      return { lat: 48.864716, lng: 2.349014 }; // Paris
    }

    return { lat: centerFromClubs.latitude, lng: centerFromClubs.longitude };
  };

  return (
    <MapContainer
      className={`fr-mx-auto ${styles.map}`}
      // center={computeMapCenter()}
      center={{ lat: 48.864716, lng: 2.349014 }}
      zoom={3}
      scrollWheelZoom={true}
      maxZoom={25}
      minZoom={3}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      <Clusterizer clubs={clubs} />

      {centerPosition && (
        <Circle center={[centerPosition.lat, centerPosition.lng]} radius={radius} />
      )}
    </MapContainer>
  );
};

export default ClubsMap;
