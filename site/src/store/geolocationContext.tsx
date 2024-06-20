import React, { ReactNode } from 'react';
import { useGeolocation, GeolocationState } from '@uidotdev/usehooks';

export const GeolocationContext = React.createContext<GeolocationState>({
  loading: true,
  accuracy: null,
  altitude: null,
  altitudeAccuracy: null,
  heading: null,
  latitude: null,
  longitude: null,
  speed: null,
  timestamp: null,
  error: null,
});

interface Props {
  children: ReactNode;
}

const GeolocationProvider: React.FC<Props> = ({ children }) => {
  const geolocation = useGeolocation();

  return (
    <>
      {JSON.stringify(geolocation)}
      <GeolocationContext.Provider value={geolocation}>{children}</GeolocationContext.Provider>;
    </>
  );
};

export default GeolocationProvider;
