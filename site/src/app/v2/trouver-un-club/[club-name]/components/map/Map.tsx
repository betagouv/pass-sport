import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { LatLngLiteral } from 'leaflet';
import styles from './styles.module.scss';
import { Club } from 'types/Club';

interface Props {
  club: Club;
}

const Map: React.FC<Props> = ({ club }) => {
  if (!club.geoloc_finale) {
    return null;
  }

  const position: LatLngLiteral = { lat: club.geoloc_finale.lat, lng: club.geoloc_finale.lon };

  return (
    <MapContainer className={styles.map} center={position} zoom={17} scrollWheelZoom={false}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      <Marker position={position}>
        <Popup>{club.nom}</Popup>
      </Marker>
    </MapContainer>
  );
};

export default Map;
