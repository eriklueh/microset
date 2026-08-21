// Convex ← Clerk auth (F4, capa social). El `domain` es el issuer de Clerk (Frontend API
// URL) y `applicationID` DEBE coincidir con el nombre del JWT template en Clerk ("convex").
// Ver docs/VISION.md §6 (Social) + la guía de setup.
export default {
  providers: [
    {
      domain: "https://becoming-bison-9194.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
