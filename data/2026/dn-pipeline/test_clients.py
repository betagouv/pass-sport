"""Tests of dn_client against fake HTTP servers.

Run from data/ : source .venv/bin/activate && pytest 2026/dn-pipeline/test_clients.py
"""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
import requests

from dn_client import DnApiError, DnClient, DnMutationError


@pytest.fixture
def server():
    """A fake API: `answers` is a list of (status, body) served in order, `received` keeps
    (method, path, headers, json body)."""
    state = {'answers': [], 'received': []}

    class Handler(BaseHTTPRequestHandler):
        def _answer(self):
            length = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(length)) if length else None
            state['received'].append((self.command, self.path, dict(self.headers), body))
            status, payload = state['answers'].pop(0)
            if payload == 'hang':
                time.sleep(1)
                return
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())

        do_GET = do_POST = _answer

        def log_message(self, *args):
            pass

    httpd = HTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    state['url'] = f'http://127.0.0.1:{httpd.server_port}'
    yield state
    httpd.shutdown()


# --- Démarches Numériques ---------------------------------------------------------------

def page(numbers, has_next, cursor=None):
    return (200, {'data': {'demarche': {'dossiers': {
        'pageInfo': {'hasNextPage': has_next, 'endCursor': cursor},
        'nodes': [{'number': number} for number in numbers]}}}})


def test_dn_paginates_the_dossiers_en_instruction(server):
    server['answers'] += [page([1, 2], True, 'c1'), page([3], False)]
    client = DnClient(server['url'], 'jeton')

    assert [d['number'] for d in client.iter_dossiers(1234)] == [1, 2, 3]
    variables = [body['variables'] for _, _, _, body in server['received']]
    assert variables == [{'numero': 1234, 'state': 'en_instruction', 'after': None},
                         {'numero': 1234, 'state': 'en_instruction', 'after': 'c1'}]
    assert server['received'][0][2]['Authorization'] == 'Bearer jeton'


def test_dn_retries_a_query_on_server_errors(server):
    server['answers'] += [(502, {}), (200, {'data': {'demarche': {'labels': [{'id': 'L1', 'name': 'a'}]}}})]
    client = DnClient(server['url'], 'jeton', retry_delay=0)
    assert client.labels(1234) == {'a': 'L1'}


def test_dn_lists_the_private_annotations_with_their_type(server):
    server['answers'] += [(200, {'data': {'demarche': {'activeRevision': {'annotationDescriptors': [
        {'__typename': 'TextareaChampDescriptor', 'id': 'Q2hhbXAtMQ==', 'label': 'Codes pass Sport'}]}}}})]

    assert DnClient(server['url'], 'jeton').annotations(1234) == {
        'Codes pass Sport': {'id': 'Q2hhbXAtMQ==', 'type': 'TextareaChampDescriptor'}}
    assert server['received'][0][3]['variables'] == {'numero': 1234}


def test_dn_annotation_is_written_as_a_texte_long_value(server):
    server['answers'] += [(200, {'data': {'dossierModifierAnnotations': {
        'annotations': [{'id': 'A1'}], 'errors': None}}})]

    DnClient(server['url'], 'jeton').annoter('D1', 'I1', 'A1', 'Ola DORVAT : 26-ABCD-EFGH')

    body = server['received'][0][3]
    assert 'dossierModifierAnnotations' in body['query']
    assert body['variables'] == {'input': {'dossierId': 'D1', 'instructeurId': 'I1', 'annotations': [
        {'id': 'A1', 'value': {'textarea': 'Ola DORVAT : 26-ABCD-EFGH'}}]}}


def test_dn_raises_graphql_errors(server):
    server['answers'] += [(200, {'errors': [{'message': 'Demarche not found'}]})]
    with pytest.raises(DnApiError, match='Demarche not found'):
        DnClient(server['url'], 'jeton').labels(1)


def test_dn_mutation_refused_for_its_dossier(server):
    server['answers'] += [(200, {'data': {'dossierAccepter': {
        'dossier': None, 'errors': [{'message': 'Le dossier est déjà accepté'}]}}})]
    with pytest.raises(DnMutationError, match='déjà accepté'):
        DnClient(server['url'], 'jeton').accepter('D1', 'I1', 'ok')
    assert server['received'][0][3]['variables'] == {
        'input': {'dossierId': 'D1', 'instructeurId': 'I1', 'motivation': 'ok'}}


def test_dn_mutation_is_retried_on_429_only(server):
    server['answers'] += [(429, {}), (200, {'data': {'dossierEnvoyerMessage': {
        'message': {'id': 'M1'}, 'errors': None}}})]
    client = DnClient(server['url'], 'jeton', retry_delay=0)
    assert client.envoyer_message('D1', 'I1', 'Bonjour')['message'] == {'id': 'M1'}

    server['received'].clear()
    server['answers'] += [(500, {})]
    with pytest.raises(requests.HTTPError):
        client.envoyer_message('D1', 'I1', 'Bonjour')
    assert len(server['received']) == 1


def test_dn_mutation_is_never_retried_after_a_timeout(server):
    server['answers'] += [(200, 'hang'), (200, {})]
    client = DnClient(server['url'], 'jeton', timeout=0.2, retry_delay=0)
    with pytest.raises(requests.ReadTimeout):
        client.ajouter_label('D1', 'L1')
    assert len(server['received']) == 1
