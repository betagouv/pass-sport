describe('About page', () => {
  it('should have appropriate titles, links and buttons', () => {
    cy.visit('https://www.pass.sports.gouv.fr/v2/tout-savoir-sur-le-pass-sport');

    cy.findByRole('heading', { level: 1, name: /tout savoir sur le pass sport/i });
    cy.findByRole('heading', { level: 1, name: /puis-je bénéficier du pass Sport \?/i });
    cy.findByRole('heading', { level: 2, name: /qu'est-ce que le pass sport \?/i });
    cy.findByRole('heading', { level: 2, name: /qui peut obtenir le pass sport \?/i });
    cy.findByRole('heading', { level: 2, name: /comment utiliser son pass sport \?/i });
    cy.findByRole('heading', { level: 2, name: /où l'utiliser \?/i });
    cy.findByRole('heading', { level: 2, name: /texte de référence/i });
    cy.findByRole('heading', { level: 3, name: /nicolas dupont/i });

    cy.findByRole('link', { name: /visiter la page de foire aux questions/i });
    cy.findByRole('link', { name: /visiter la page pour trouver un club/i });
    cy.findByRole('link', {
      name: /décret n° 2024-500 du 31 mai 2024 relatif au « pass sport » 2024/i,
    });

    cy.findAllByRole('link', {
      name: /visiter la page pour effectuer le test d'éligibilité/i,
    }).should('have.length', 2);

    cy.findByRole('link', {
      name: /instagram/i,
    });

    cy.findByRole('link', {
      name: /tiktok/i,
    });
  });
});
