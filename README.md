# claude-code-mods

Mods pour [Claude Code](https://claude.com/claude-code) : des extensions de son interface, installables en une ligne.

*Mods for Claude Code: interface extensions you install with one line. The mods' interface text is in French.*

## Mods

| Mod | Ce qu'il fait |
|---|---|
| [`diff-replie`](plugins/diff-replie) | Replie les diffs des éditions de fichiers et la sortie des commandes shell en une ligne, regroupe les appels consécutifs du même type, et `/details` déplie tout |

## Installer

Dans une session Claude Code, à l'invite du terminal :

```
/plugin install diff-replie --marketplace Aliquanto3/claude-code-mods
```

Répondre `y` pour ajouter le marketplace, puis choisir la portée (utilisateur par défaut). Le mod est actif aussitôt, sans redémarrage, si les mods de code sont activés.

**Prérequis** : les mods de code de Claude Code sont en accès anticipé. Sans la variable `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, le mod s'installe mais ne se charge pas, sans message. Ajoutez-la au bloc `env` de `~/.claude/settings.json` (`"env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" }`), puis redémarrez Claude Code. Testé avec Claude Code 2.1.280 et 2.1.306.

Depuis un shell :

```
claude plugin install diff-replie --marketplace Aliquanto3/claude-code-mods
```

Dans l'application de bureau, où `/plugin` ne fonctionne pas : cliquer sur **+** à côté de la zone de saisie, puis **Plugins**, **Add marketplace** avec `Aliquanto3/claude-code-mods`, puis **Add plugin**.

## diff-replie

Les éditions de fichiers et les commandes shell occupent beaucoup de place dans la conversation. Le mod les replie :

- **Édition (Edit, Write)** : `⎿  Modifié epics.md (+42 −7)` au lieu du diff ; `Créé notes.md (40 lignes)` pour un nouveau fichier.
- **Commande (Bash, PowerShell)** : la ligne d'appel montre la description de la commande, et la sortie devient `⎿  Sortie repliée : 12 lignes de sortie`.
- **Appels consécutifs du même type**, sans texte entre eux : une seule ligne, par exemple `● 3 commandes shell : Lister le dossier · Compter les lignes · Nettoyer`.
- **Erreurs** : un appel en échec reste affiché en entier.
- **`/details`** : déplie tout, puis replie tout au second appel.
- **Plein écran** (`/tui fullscreen`) : les boutons « Voir le diff », « Voir la sortie » et « Voir le détail » déplient un appel ou un groupe d'un clic. En affichage normal, le terminal ne transmet pas les clics : la ligne dit `/details pour déplier`.

Le mod ne change que l'affichage : Claude reçoit toujours le résultat complet de chaque appel. Les appels que Claude Code range déjà dans ses propres lignes repliées (lectures, recherches) ne sont pas touchés.

## Licence

[Apache 2.0](LICENSE).

## Développer un mod

```
claude plugin validate plugins/<mod>
claude plugin test plugins/<mod>
claude --plugin-dir plugins/<mod>
```
