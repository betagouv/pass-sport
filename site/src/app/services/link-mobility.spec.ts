import {
  buildEmailRequestBody,
  buildEmailUrl,
  listEmailTemplates,
  parseSendEmailResponse,
  sendTransactionalEmail,
  TransactionalEmailParams,
} from './link-mobility';

global.fetch = jest.fn() as jest.Mock;

const params = (overrides: Partial<TransactionalEmailParams> = {}): TransactionalEmailParams => ({
  subject: 'Votre code pass Sport',
  html: '<p>Bonjour</p>',
  recipients: ['jean@example.org'],
  ...overrides,
});

function mockFetch(status: number, responseBody: unknown) {
  (global.fetch as jest.Mock).mockImplementationOnce(() =>
    Promise.resolve({
      json: () => Promise.resolve(responseBody),
      status,
      ok: status === 200,
    }),
  );
}

describe('link-mobility service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LINK_MOBILITY_API_KEY = 'test-api-key';
    process.env.LINK_MOBILITY_SENDER_EMAIL = 'pass.sport@sh-mail.fr';
    process.env.LINK_MOBILITY_SENDER_NAME = 'pass Sport';
    delete process.env.LINK_MOBILITY_API_URL;
  });

  describe('buildEmailUrl', () => {
    it('targets the production endpoint by default', () => {
      expect(buildEmailUrl().toString()).toBe('https://diffusion.linkmobility.fr/api/envoyer/e-mail');
    });

    it('honors the LINK_MOBILITY_API_URL override', () => {
      process.env.LINK_MOBILITY_API_URL = 'http://localhost:8080';
      expect(buildEmailUrl().toString()).toBe('http://localhost:8080/api/envoyer/e-mail');
    });
  });

  describe('buildEmailRequestBody', () => {
    it('builds the form-encoded payload expected by the API', () => {
      const body = buildEmailRequestBody(
        params({ recipients: ['jean@example.org', 'zoe@example.org'] }),
      );

      expect(Object.fromEntries(body)).toEqual({
        key: 'test-api-key',
        sujet: 'Votre code pass Sport',
        message: '<p>Bonjour</p>',
        destinataires: 'jean@example.org,zoe@example.org',
        expediteur: 'pass.sport@sh-mail.fr',
        nom_expediteur: 'pass Sport',
        erreur_texte: '1',
      });
    });

    it('adds the optional parameters only when provided', () => {
      const body = buildEmailRequestBody(
        params({
          replyTo: 'contact@pass.sports.gouv.fr',
          name: 'code-envoi-2026',
          alternativeText: 'Bonjour',
        }),
      );

      expect(body.get('email_reponse')).toBe('contact@pass.sports.gouv.fr');
      expect(body.get('nom')).toBe('code-envoi-2026');
      expect(body.get('alternatif')).toBe('Bonjour');
    });

    it('lets the params override the env-configured sender', () => {
      const body = buildEmailRequestBody(
        params({ senderEmail: 'autre@sh-mail.fr', senderName: 'Autre' }),
      );

      expect(body.get('expediteur')).toBe('autre@sh-mail.fr');
      expect(body.get('nom_expediteur')).toBe('Autre');
    });

    it('throws when a required env variable is missing', () => {
      delete process.env.LINK_MOBILITY_API_KEY;
      expect(() => buildEmailRequestBody(params())).toThrow(
        'Error: LINK_MOBILITY_API_KEY is not set',
      );
    });

    it('throws on an empty recipients list', () => {
      expect(() => buildEmailRequestBody(params({ recipients: [] }))).toThrow(
        'Error: at least one recipient is required',
      );
    });

    it('selects a registered template via type_message=creation', () => {
      const body = buildEmailRequestBody(params({ html: undefined, templateId: 455 }));

      expect(body.get('type_message')).toBe('creation');
      expect(body.get('message')).toBe('455');
    });

    it('requires exactly one of html / templateId', () => {
      expect(() => buildEmailRequestBody(params({ html: undefined }))).toThrow(
        'Error: provide exactly one of html or templateId',
      );
      expect(() => buildEmailRequestBody(params({ templateId: 455 }))).toThrow(
        'Error: provide exactly one of html or templateId',
      );
    });

    it('encodes per-recipient variables as destinataires_type=datas', () => {
      const body = buildEmailRequestBody(
        params({
          html: undefined,
          templateId: 455,
          recipients: ['jean@example.org', 'zoe@example.org'],
          variables: {
            'jean@example.org': { prenom: 'Jean', code: 'ABC-123' },
            'zoe@example.org': { prenom: 'Zoé', code: 'DEF-456' },
          },
        }),
      );

      expect(body.get('destinataires_type')).toBe('datas');
      expect(body.get('destinataires')).toBeNull();
      expect(body.get('destinataires[jean@example.org][prenom]')).toBe('Jean');
      expect(body.get('destinataires[jean@example.org][code]')).toBe('ABC-123');
      expect(body.get('destinataires[zoe@example.org][prenom]')).toBe('Zoé');
      expect(body.get('destinataires[zoe@example.org][code]')).toBe('DEF-456');
    });

    it('throws when a recipient has no variables entry in datas mode', () => {
      expect(() =>
        buildEmailRequestBody(
          params({
            recipients: ['jean@example.org', 'zoe@example.org'],
            variables: { 'jean@example.org': { prenom: 'Jean' } },
          }),
        ),
      ).toThrow('Error: missing variables for recipient(s): zoe@example.org');
    });
  });

  describe('parseSendEmailResponse', () => {
    it('maps an accepted request to a success result', () => {
      expect(parseSendEmailResponse({ resultat: 1, id: 1337 })).toEqual({
        sent: true,
        campaignId: 1337,
      });
    });

    it('maps a rejection to codes and human-readable messages', () => {
      expect(parseSendEmailResponse({ resultat: 0, erreurs: '18,20' })).toEqual({
        sent: false,
        errorCodes: ['18', '20'],
        errorMessages: ['Le sujet est trop court', "Le nom d'expéditeur est trop court"],
      });
    });

    it('keeps unknown codes with a fallback message', () => {
      const result = parseSendEmailResponse({ resultat: 0, erreurs: 424242 });
      expect(result).toEqual({
        sent: false,
        errorCodes: ['424242'],
        errorMessages: ['Erreur Link Mobility inconnue (424242)'],
      });
    });

    it('treats a success without id as a failure', () => {
      expect(parseSendEmailResponse({ resultat: 1 })).toEqual({
        sent: false,
        errorCodes: [],
        errorMessages: [],
      });
    });
  });

  describe('sendTransactionalEmail', () => {
    it('POSTs the form-encoded payload and returns the campaign id', async () => {
      mockFetch(200, { resultat: 1, id: 42 });

      const result = await sendTransactionalEmail(params());

      expect(result).toEqual({ sent: true, campaignId: 42 });

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url.toString()).toBe('https://diffusion.linkmobility.fr/api/envoyer/e-mail');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
      expect(init.body).toContain('key=test-api-key');
      expect(init.body).toContain('destinataires=jean%40example.org');
    });

    it('returns the decoded errors when the API rejects the send', async () => {
      mockFetch(200, { resultat: 0, erreurs: '30' });

      const result = await sendTransactionalEmail(params());

      expect(result).toEqual({
        sent: false,
        errorCodes: ['30'],
        errorMessages: ['Clé API non reconnue'],
      });
    });

    it('throws on a non-200 HTTP response', async () => {
      mockFetch(500, {});

      await expect(sendTransactionalEmail(params())).rejects.toThrow(
        'Request to Link Mobility on /api/envoyer/e-mail has failed. Response status is 500.',
      );
    });
  });

  describe('listEmailTemplates', () => {
    it('lists the account emailing templates (output=1)', async () => {
      mockFetch(200, [
        {
          id: 455,
          thumbnail: '/uploads/thumb.png',
          output: 1,
          name: 'Modèle 1',
          date_creation: 1327843894,
          date_update: 1327843894,
          is_online: true,
        },
      ]);

      const templates = await listEmailTemplates();

      expect(templates).toEqual([
        { id: 455, name: 'Modèle 1', date_creation: 1327843894, date_update: 1327843894 },
      ]);

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url.toString()).toBe('https://diffusion.linkmobility.fr/api/medias/lister');
      expect(init.body).toContain('output=1');
    });

    it('throws on a non-200 HTTP response', async () => {
      mockFetch(500, []);

      await expect(listEmailTemplates()).rejects.toThrow(
        'Request to Link Mobility on /api/medias/lister has failed. Response status is 500.',
      );
    });
  });
});
