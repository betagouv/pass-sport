import { SportGouvJSONExportsResponse } from 'types/Club';
import { useContext, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GeolocationContext } from '@/store/geolocationContext';

interface Props {
  clubsResponse: SportGouvJSONExportsResponse;
}

const ClubMapView: React.FC<Props> = ({ clubsResponse }) => {
  const ClubsMap = useMemo(() => dynamic(() => import('../clubs-map/ClubsMap')), []);

  const { longitude, latitude } = useContext(GeolocationContext);

  const isGeolocationAuthorized = !!(longitude && latitude);
  return (
    <div>
      <ClubsMap
        clubs={clubsResponse.results}
        centerPosition={isGeolocationAuthorized ? { lat: latitude, lng: longitude } : undefined}
        radius={20000}
      />
    </div>
  );
};

export default ClubMapView;
