import { usePathname } from 'next/navigation';

export function useIsNotFound({
  internalRoutes,
  navigationItemsMap,
  dynamicRoutePrefixes = [],
}: {
  internalRoutes: string[];
  navigationItemsMap: string[];
  dynamicRoutePrefixes?: string[];
}) {
  const paths = usePathname();
  const knownRoutes = [...navigationItemsMap, ...internalRoutes];

  if (!paths) {
    return false;
  }

  return (
    !knownRoutes.includes(paths) && !dynamicRoutePrefixes.some((prefix) => paths.startsWith(prefix))
  );
}
