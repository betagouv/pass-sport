export const SEARCH_QUERY_PARAMS = {
  city: 'city',
  postalCode: 'postalCode',
  activity: 'activity',
  handicap: 'disability',
  centerLat: 'centerLat',
  centerLng: 'centerLng',
  zoom: 'zoom',
  isShowingMapTab: 'map',
  aroundMe: 'aroundme',
} as const;

export type UrlQueryParameters = (typeof SEARCH_QUERY_PARAMS)[keyof typeof SEARCH_QUERY_PARAMS];

export const CONTACT_PAGE_QUERYPARAMS = {
  modalOpened: 'modalOpened',
  segment: 'segment',
};

export const FAQ_PAGE_QUERY_PARAMS = {
  displayType: 'displayType',
};

export const JEUNES_PARENTS_PAGE_AEEH_PARAMS = {
  aeehModalOpened: 'aeehModalOpened',
};
