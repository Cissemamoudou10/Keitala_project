# Journal des sessions — ERP Keitala

Une entrée par session de travail, **la plus récente en haut**. C'est le relais entre agents et entre outils : écrire pour quelqu'un qui n'a rien vu de la session.

**Modèle d'entrée** (à copier)

```
## AAAA-MM-JJ — Outil / agent — Titre de la session
- **Tâche** : identifiant et intitulé (ex. US-VTE-01 Saisie rapide de vente)
- **Fait** : ce qui est terminé et vérifié.
- **Non fait / en cours** : ce qui reste, et où en est le code.
- **Vérifications** : tests lancés et résultat ; ce qui n'a pas été vérifié.
- **Décisions** : D-0XX ajoutées (ou « aucune »).
- **Problèmes** : P-0XX ouverts ou résolus (ou « aucun »).
- **À reprendre par le suivant** : la première chose à faire.
```

---

## 2026-11-13 — Claude — Mise en place du cadre de développement
- **Tâche** : préparer le projet pour un développement à plusieurs agents.
- **Fait** : `AGENTS.md` et `CLAUDE.md` ; dossier `suivi/` (avancement, décisions D-001 à D-021, problèmes P-001 à P-011, journal) ; `design/CHARTE_UX_UI.md` ; `developpement/app` et `developpement/api` avec leur README ; `.gitignore`.
- **Non fait / en cours** : aucun code. Git non initialisé. Les projets Next.js et FastAPI ne sont pas créés.
- **Vérifications** : contrastes de la palette calculés (tous les textes courants au-dessus de 4,5:1).
- **Décisions** : D-009, D-010, D-019 ; D-021 proposée, à confirmer.
- **Problèmes** : P-005, P-006, P-007, P-009, P-010 ouverts.
- **À reprendre par le suivant** : Sprint 0, tâche S0-1 de `AVANCEMENT.md`. Faire confirmer D-021 par l'utilisateur avant d'installer les outils.

## 2026-11-13 — Claude — Analyse et correction des spécifications (v1.1)
- **Tâche** : analyser le dossier, puis corriger les incohérences.
- **Fait** : `schema.sql` réécrit en v1.1 (24 tables) ; cahier des charges, conception technique, UML et backlog alignés (34 stories) ; versions d'origine copiées dans `archive_v1.0/`.
- **Non fait / en cours** : rien.
- **Vérifications** : `schema.sql` exécuté sur un PostgreSQL 16 de test ; contraintes vérifiées (stock négatif, journaux immuables, don avec montant, règlement sans pièce). Rendu des diagrammes Mermaid non vérifié (P-011).
- **Décisions** : D-001 à D-008, D-011 à D-018, D-020.
- **Problèmes** : P-001 à P-004, P-008, P-011 ouverts.
- **À reprendre par le suivant** : voir l'entrée du dessus.
