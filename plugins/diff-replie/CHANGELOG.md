# Changelog — diff-replie

## 1.0.1

- Correction : le mod ne se chargeait plus sous Claude Code 2.1.280 (`atom`, `read`, `update`,
  retirés de `claude-code`, et l'analyseur interdit de toute façon de passer `$` à une fonction
  importée). L'état du mod (groupes, lignes dépliées, résumés) passe par de simples variables au
  niveau du fichier, et les changements déclenchés hors du rendu courant (commande `/details`,
  retrait d'un appel replié par Claude Code, boutons) appellent désormais `$.ui.invalidate('ui.render')`.
- Retrait du champ `types` du manifeste : le mod n'ajoute rien à `$` dans `engine.create`, ce champ
  ne le concernait pas et produisait un avertissement de validation inutile.
- Comportement inchangé : repli des diffs et des sorties, regroupement des appels consécutifs,
  `/details`.

## 1.0.0

- Version initiale.
