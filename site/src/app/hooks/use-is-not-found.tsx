import { usePathname } from 'next/navigation';

export function useIsNotFound({
  internalRoutes,
  navigationItemsMap,
}: {
  internalRoutes: string[];
  navigationItemsMap: string[];
}) {
  const paths = usePathname();
  const knownRoutes = [...navigationItemsMap, ...internalRoutes];

  return paths && !knownRoutes.includes(paths);
}
