"""Minimal Démarches Numériques GraphQL client: the dossiers of a démarche and four mutations.

    client = DnClient('https://demarche.numerique.gouv.fr/api/v2/graphql', token)

Queries are retried on 429/5xx and network errors. Mutations are only retried on 429: any
other failure may have reached DN (a message already sent), so it is left to the caller.
"""

import time

import requests

DEFAULT_API_URL = 'https://demarche.numerique.gouv.fr/api/v2/graphql'
PAGE_SIZE = 100
MAX_ATTEMPTS = 4

_CHAMP_FIELDS = '''
fragment ChampValeur on Champ {
  __typename
  label
  stringValue
  ... on DateChamp { date }
  ... on YesNoChamp { oui: value }
  ... on AddressChamp { address { cityCode postalCode cityName streetAddress } }
}
'''

DOSSIERS_QUERY = '''
query dossiers($numero: Int!, $state: DossierState, $after: String) {
  demarche(number: $numero) {
    dossiers(state: $state, first: %d, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        number
        state
        connectionUsager
        deposeParUnTiers
        usager { email }
        demandeur { __typename ... on PersonnePhysique { civilite nom prenom email } }
        labels { id name }
        champs {
          ...ChampValeur
          ... on RepetitionChamp { rows { champs { ...ChampValeur } } }
        }
        annotations { id label stringValue }
      }
    }
  }
}
''' % PAGE_SIZE + _CHAMP_FIELDS

LABELS_QUERY = '''
query labels($numero: Int!) {
  demarche(number: $numero) { labels { id name } }
}
'''

ANNOTATIONS_QUERY = '''
query annotations($numero: Int!) {
  demarche(number: $numero) { activeRevision { annotationDescriptors { __typename id label } } }
}
'''

ENVOYER_MESSAGE = '''
mutation envoyer($input: DossierEnvoyerMessageInput!) {
  dossierEnvoyerMessage(input: $input) { message { id } errors { message } }
}
'''

AJOUTER_LABEL = '''
mutation label($input: DossierAjouterLabelInput!) {
  dossierAjouterLabel(input: $input) { label { id } errors { message } }
}
'''

ACCEPTER = '''
mutation accepter($input: DossierAccepterInput!) {
  dossierAccepter(input: $input) { dossier { id state } errors { message } }
}
'''

ANNOTER = '''
mutation annoter($input: DossierModifierAnnotationsInput!) {
  dossierModifierAnnotations(input: $input) { annotations { id } errors { message } }
}
'''


class DnApiError(RuntimeError):
    """GraphQL-level failure: the whole request was refused."""


class DnMutationError(RuntimeError):
    """The mutation reached DN, which refused it for this dossier."""


class DnClient:
    def __init__(self, api_url: str, token: str, session: requests.Session = None,
                 timeout: float = 60, retry_delay: float = 5):
        self.api_url = api_url or DEFAULT_API_URL
        self.timeout = timeout
        self.retry_delay = retry_delay
        self.session = session or requests.Session()
        self.session.headers['Authorization'] = f'Bearer {token}'

    def _post(self, query: str, variables: dict, is_mutation: bool) -> dict:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            last = attempt == MAX_ATTEMPTS
            try:
                response = self.session.post(self.api_url, json={'query': query, 'variables': variables},
                                             timeout=self.timeout)
            except requests.RequestException:
                if is_mutation or last:
                    raise
                time.sleep(self.retry_delay * attempt)
                continue

            retryable = response.status_code == 429 or (
                response.status_code >= 500 and not is_mutation)
            if retryable and not last:
                time.sleep(self.retry_delay * attempt)
                continue
            response.raise_for_status()

            payload = response.json()
            if payload.get('errors'):
                raise DnApiError('; '.join(error.get('message', '') for error in payload['errors']))
            return payload['data']

    def labels(self, numero: int) -> dict[str, str]:
        """Label name -> label id, as defined on the démarche."""
        data = self._post(LABELS_QUERY, {'numero': numero}, is_mutation=False)
        return {label['name']: label['id'] for label in data['demarche']['labels']}

    def annotations(self, numero: int) -> dict[str, dict]:
        """Private annotation label -> {'id', 'type'}, type being its descriptor's GraphQL type."""
        data = self._post(ANNOTATIONS_QUERY, {'numero': numero}, is_mutation=False)
        return {descriptor['label']: {'id': descriptor['id'], 'type': descriptor['__typename']}
                for descriptor in data['demarche']['activeRevision']['annotationDescriptors']}

    def iter_dossiers(self, numero: int, state: str = 'en_instruction'):
        after = None
        while True:
            data = self._post(DOSSIERS_QUERY, {'numero': numero, 'state': state, 'after': after},
                              is_mutation=False)
            dossiers = data['demarche']['dossiers']
            yield from dossiers['nodes']
            if not dossiers['pageInfo']['hasNextPage']:
                return
            after = dossiers['pageInfo']['endCursor']

    def _mutate(self, query: str, field: str, input_: dict) -> dict:
        result = self._post(query, {'input': input_}, is_mutation=True)[field]
        if result.get('errors'):
            raise DnMutationError('; '.join(error['message'] for error in result['errors']))
        return result

    def envoyer_message(self, dossier_id: str, instructeur_id: str, body: str) -> dict:
        return self._mutate(ENVOYER_MESSAGE, 'dossierEnvoyerMessage',
                            {'dossierId': dossier_id, 'instructeurId': instructeur_id, 'body': body})

    def ajouter_label(self, dossier_id: str, label_id: str) -> dict:
        return self._mutate(AJOUTER_LABEL, 'dossierAjouterLabel',
                            {'dossierId': dossier_id, 'labelId': label_id})

    def accepter(self, dossier_id: str, instructeur_id: str, motivation: str) -> dict:
        return self._mutate(ACCEPTER, 'dossierAccepter',
                            {'dossierId': dossier_id, 'instructeurId': instructeur_id,
                             'motivation': motivation})

    def annoter(self, dossier_id: str, instructeur_id: str, annotation_id: str, texte: str) -> dict:
        """Replaces the value of a « Texte long » private annotation."""
        return self._mutate(ANNOTER, 'dossierModifierAnnotations',
                            {'dossierId': dossier_id, 'instructeurId': instructeur_id,
                             'annotations': [{'id': annotation_id, 'value': {'textarea': texte}}]})
