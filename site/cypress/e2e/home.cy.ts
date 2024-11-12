describe('Home page', () => {
  it('should have appropriate titles, links and buttons', () => {
    cy.visit('https://www.pass.sports.gouv.fr/');
    cy.findByRole('link', { name: /je fais le test/i });
    cy.findByRole('link', { name: /découvrir le pass sport/i });
    cy.findByRole('link', { name: /qui peut en bénéficier/i });
    cy.findByRole('link', { name: /besoin d'aide/i });
    cy.findByRole('link', { name: /visiter la page pour trouver un club/i });
    cy.findByRole('link', { name: /instagram/i });
    cy.findByRole('link', { name: /tiktok/i });
    cy.findByRole('button', { name: /autoriser/i });

    // Open transcription and check the dialog semantic element and close it
    cy.findByRole('button', { name: /transcription/i }).click();
    cy.findByRole('dialog', { name: /présentation du dispositif/i });

    cy.findByRole('heading', { level: 1, name: /suivez-nous sur les réseaux sociaux/i });
  });
});
