# Notes pour Claude

- Projet : **3ajib Games**, un hub de jeux entre amis dans le navigateur (Monopoly 3ajib Edition en 3D isométrique, Uno, Loups-Garous…). Le propriétaire parle français : interface, messages d'erreur, logs et commentaires en français.
- Hébergement GitHub Pages uniquement (statique), dépôt `marroqui932.github.io` servi à la racine. Routage par hash : `#/` hub, `#/monopoly`, `#/uno`, `#/loup`. Chaque jeu est chargé à la demande.
- Multijoueur : l'hôte fait tourner le moteur dans son navigateur, les autres en WebRTC (PeerJS) ; préfixe de salle commun `3ajib-v1-` et message `which` pour savoir quel jeu héberge un code. Pas de serveur de jeu. Pseudo uniquement, profil commun (`src/profile.ts`).
- Chaque jeu : moteur pur dans `packages/<jeu>` (sans dépendance ni DOM, testé, simulation de parties aléatoires) + interface dans `apps/web/src/games/<jeu>/`. Jeux à information cachée : l'hôte n'envoie à chaque joueur que sa vue (`viewFor`, `eventsFor`).
- Direction artistique commune « la nuit sur le 93 » : bleu nuit, orange réverbère, rose néon ; typo Bungee pour titres et montants, Rubik pour le reste ; variables CSS dans `apps/web/src/styles.css`.
- Monopoly : règles classiques complètes, édition française ; thème et médias perso dans des fichiers de données (`packages/engine/src/themes`, `apps/web/public/media/3ajib`).
- Loups-Garous : l'hôte fait le narrateur via `step {id, ms}` + action `timeout` (refusée venant d'un client). Les étapes de nuit des rôles morts/absents ont une durée aléatoire pour ne rien trahir ; les événements privés portent `to`.
- Toujours lancer `pnpm test` et `pnpm typecheck` avant de commit.
