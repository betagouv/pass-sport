import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

const MapZoomHandler = () => {
  const map = useMap();

  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const onZoomEnd = () => {
      setMsg(`le zoom de la carte est maintenant au niveau ${map.getZoom()}`);
    };

    map.on('zoomend', onZoomEnd);

    return () => {
      map.off('zoomend', onZoomEnd);
    };
  }, [map]);

  return <p aria-live="polite">{msg}</p>;
};

export default MapZoomHandler;
