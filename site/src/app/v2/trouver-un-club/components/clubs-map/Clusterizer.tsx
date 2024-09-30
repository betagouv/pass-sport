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

  markers = L.markerClusterGroup({
    // This function is used within leaflet, do not remove because the IDE tells you so
    iconCreateFunction: (cluster) => {
      var childCount = cluster.getChildCount();

      var markerCluster = ' marker-cluster-';
      if (childCount < 10) {
        markerCluster += 'small';
      } else if (childCount < 100) {
        markerCluster += 'medium';
      } else {
        markerCluster += 'large';
      }

      // aria-label for screen reader
      return new L.DivIcon({
        html: `<div><span aria-label="${childCount} clubs">${childCount}</span></div>`,
        className: 'marker-cluster' + markerCluster,
        iconSize: new L.Point(40, 40),
      });
    },
    maxClusterRadius: 40,
  });

  clubs.forEach((club) => {
    const { geoloc_finale, nom } = club;
    if (geoloc_finale) {
      let marker = L.marker(new L.LatLng(geoloc_finale.lat, geoloc_finale.lon), { alt: nom });

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
