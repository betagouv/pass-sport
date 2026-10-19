"""Minimal Grist REST client: the support table's columns and rows, and their status update.

    client = GristClient('https://grist.numerique.gouv.fr/api', api_key, doc_id)
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

UPDATE_BATCH_SIZE = 500


class GristClient:
    def __init__(self, api_url: str, api_key: str, doc_id: str, session: requests.Session = None,
                 timeout: float = 30, backoff_factor: float = 2):
        self.base_url = f"{api_url.rstrip('/')}/docs/{doc_id}"
        self.timeout = timeout
        self.session = session or requests.Session()
        self.session.headers['Authorization'] = f'Bearer {api_key}'
        # A PATCH writes the same values again: retrying it is safe.
        retry = Retry(total=4, backoff_factor=backoff_factor,
                      status_forcelist=(429, 500, 502, 503, 504),
                      allowed_methods={'GET', 'PATCH'})
        self.session.mount('https://', HTTPAdapter(max_retries=retry))
        self.session.mount('http://', HTTPAdapter(max_retries=retry))

    def _request(self, method: str, path: str, **kwargs) -> dict:
        response = self.session.request(method, f'{self.base_url}{path}', timeout=self.timeout,
                                        **kwargs)
        response.raise_for_status()
        return response.json() if response.content else {}

    def tables(self) -> list[str]:
        return [table['id'] for table in self._request('GET', '/tables')['tables']]

    def column_specs(self, table_id: str) -> list[dict]:
        """[{'id', 'label', 'type'}] in the table's order."""
        payload = self._request('GET', f'/tables/{table_id}/columns')
        return [{'id': column['id'], 'label': column['fields']['label'],
                 'type': column['fields'].get('type', '')} for column in payload['columns']]

    def columns(self, table_id: str) -> dict[str, str]:
        """Column label -> column id."""
        return {spec['label']: spec['id'] for spec in self.column_specs(table_id)}

    def records(self, table_id: str) -> list[dict]:
        """Every row as {'id': row_id, 'fields': {column_id: value}}."""
        return self._request('GET', f'/tables/{table_id}/records')['records']

    def update_records(self, table_id: str, records: list[dict]) -> None:
        """records: [{'id': row_id, 'fields': {column_id: value}}], sent in batches."""
        for start in range(0, len(records), UPDATE_BATCH_SIZE):
            self._request('PATCH', f'/tables/{table_id}/records',
                          json={'records': records[start:start + UPDATE_BATCH_SIZE]})
