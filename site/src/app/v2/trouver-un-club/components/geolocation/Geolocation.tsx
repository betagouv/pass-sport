'use client';
import GeolocationProvider from '@/store/geolocationContext';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
const Geolocation: React.FC<Props> = ({ children }) => {
  return <GeolocationProvider>{children}</GeolocationProvider>;
};

export default Geolocation;
