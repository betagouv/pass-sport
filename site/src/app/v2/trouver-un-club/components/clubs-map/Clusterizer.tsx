'use client';

import { useMap } from 'react-leaflet';
import { ExportedClub } from 'types/Club';
import L from 'leaflet';
import 'leaflet.markercluster/dist/leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './styles-marker-cluster.css';

interface Props {
  clubs: ExportedClub[];
}

let markers: L.MarkerClusterGroup;

const Clusterizer: React.FC<Props> = ({ clubs }) => {
  const map = useMap();

  if (markers !== undefined) {
    map.removeLayer(markers);
  }
  markers = L.markerClusterGroup();

  clubs.forEach((club) => {
    const { geoloc_finale, nom } = club;
    if (geoloc_finale) {
      var marker = L.marker(new L.LatLng(geoloc_finale.lat, geoloc_finale.lon), { alt: nom });

      const popup = L.popup().setContent(`
        <div>
          <p class='fr-text--lg fr-text--bold'> ${nom} </p> 
          <a class="fr-btn fr-btn--tertiary" href="trouver-un-club/${encodeURIComponent(nom)}">
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

export default Clusterizer;
