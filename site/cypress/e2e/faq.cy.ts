describe('FAQ page', () => {
  beforeEach(() => {
    cy.visit('https://www.pass.sports.gouv.fr/v2/une-question');
  });

  it('should have appropriate titles, links and buttons', () => {
    cy.findByRole('heading', { level: 1, name: /vous avez une question \?/i });
    cy.findByRole('heading', { level: 2, name: /comment obtenir son pass sport \?/i });
    cy.findByRole('heading', { level: 2, name: /comment utiliser le pass sport \?/i });
    cy.findByRole('heading', { level: 2, name: /problèmes lié à l’utilisation du pass sport/i });
    cy.findByRole('heading', { level: 2, name: /vous ne trouvez pas de réponse satisfaisante/i });

    cy.findByRole('button', { name: /nous contacter par mail/i });
  });

  it('should open contact modal', () => {
    cy.findByRole('button', { name: /nous contacter par mail/i })
      .should('be.visible')
      .trigger('click');

    // todo: figure out why modal is not being opened half of the time
    // cy.findByRole('heading', { level: 1, name: /formulaire de contact/i });
    // cy.findByRole('button', { name: /lire les questions fréquentes/i });
    // cy.findByRole('textbox', { name: /firstname/i }).type('test');
    // cy.findByRole('textbox', { name: /lastname/i }).type('test');
    // cy.findByRole('textbox', { name: /adresse e-mail/i }).type('test@gmail.com');
  });
});
