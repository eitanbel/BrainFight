## Règles de fonctionnement automatique

### Mise à jour automatique
À chaque fois qu'une modification est apportée à l'application
(nouvelle fonctionnalité, correction de bug, changement de comportement),
tu dois automatiquement mettre à jour ce fichier CLAUDE.md avec :
- La fonctionnalité ajoutée ou modifiée
- Les fichiers impactés
- La date de la modification

### Journal des erreurs
À chaque fois qu'une erreur est rencontrée et corrigée,
tu dois l'ajouter dans la section "Erreurs connues et corrections"
de ce fichier avec :
- Description de l'erreur
- Cause identifiée
- Solution appliquée
- Fichiers modifiés

---

# BrainFight

## Nom du projet
BrainFight

## Ce que fait l'app
Quiz multijoueur en temps réel entre amis, avec 5 modes de jeu différents.

## Stack
- React + Vite
- Firebase Realtime Database
- API Anthropic (Claude Haiku)
- react-router-dom v7

## Commandes utiles
```bash
npm install       # Installer les dépendances
npm run dev       # Lancer le serveur de développement (port 5173)
npm run build     # Build de production
```

## Structure Firebase
```
salons/{code}/
  theme             : string
  difficulte        : 'facile' | 'moyen' | 'difficile'
  nombreQuestions   : 5 | 10 | 15 | 20
  mode              : 'classique' | 'vrai_ou_faux' | 'estimation' | 'contre_la_montre' | 'qui_est_le_plus'
  statut            : 'attente' | 'en_cours' | 'termine'
  questions         : array
  questionActuelle  : number
  timerDepart       : timestamp (par question)
  timerGlobalDepart : timestamp (contre_la_montre uniquement)
  joueurs/{pseudo}/
    score           : number
    reponses/{qIdx} : any (index, boolean, number, string selon le mode)
```

## Fichiers clés
| Fichier | Rôle |
|---|---|
| `src/firebase.js` | Init Firebase, export `db` |
| `src/claude.js` | Génération de questions (4 fonctions) |
| `src/components/Home.jsx/.css` | Accueil : créer/rejoindre, sélecteur mode/difficulté/nb questions |
| `src/components/Lobby.jsx/.css` | Salon d'attente, affichage joueurs, lancement |
| `src/components/Game.jsx/.css` | Jeu en cours, gestion des 5 modes |
| `src/components/Results.jsx/.css` | Résultats finaux, podium, options rejouer |

---

## Historique des modifications

### 2026-03-20 — 4 modes de jeu supplémentaires
**Fonctionnalités :**
- Mode Vrai ou Faux : 2 boutons VRAI/FAUX, changement de réponse jusqu'au timer 0
- Mode Estimation : input numérique, 20s, scoring 3/2/1/0 pts selon l'écart (exact / ≤10% / ≤25%)
- Mode Contre la montre : 20 questions, timer global 3 min Firebase, 8s/question, flash 1s
- Mode Qui est le + : vote pour un joueur, questions générées dans le Lobby, score = votes reçus

**Fichiers impactés :**
`src/claude.js`, `src/components/Home.jsx`, `src/components/Home.css`,
`src/components/Lobby.jsx`, `src/components/Lobby.css`,
`src/components/Game.jsx`, `src/components/Game.css`,
`src/components/Results.jsx`

---

### 2026-03-20 — Animations et UX
**Fonctionnalités :**
- Slide-out/slide-in entre les questions (CSS keyframes, 350ms)
- Écran de chargement plein écran "Chargement du champ de bataille..." avec barre indéterminée et points animés
- Mini-classement compact en bas du jeu (top 3 + joueur actuel si hors top 3)

**Fichiers impactés :**
`src/components/Game.jsx`, `src/components/Game.css`,
`src/components/Home.jsx`, `src/components/Home.css`

---

### 2026-03-20 — Timer fluide + classement amélioré
**Fonctionnalités :**
- Remplacement de `setInterval` par `requestAnimationFrame` pour un timer pixel-perfect
- Couleur progressive : vert >60%, orange >30%, rouge <30% (transition CSS 0.4s)
- Suppression du chiffre du timer, barre seule

**Fichiers impactés :**
`src/components/Game.jsx`, `src/components/Game.css`

---

### 2026-03-20 — Sélecteur nombre de questions + réponse modifiable + difficulté dans résultats
**Fonctionnalités :**
- Home : sélecteur 5/10/15/20 questions (stocké Firebase)
- Game : changement de réponse libre pendant le timer, seule la dernière sélection compte
- Results : sélecteur difficulté pré-rempli dans "Changer de thème"
- Lobby : affiche le nombre de questions à côté du thème/difficulté

**Fichiers impactés :**
`src/claude.js`, `src/components/Home.jsx`, `src/components/Lobby.jsx`,
`src/components/Game.jsx`, `src/components/Results.jsx`, `src/components/Results.css`

---

### 2026-03-20 — Modes de jeu (base) + difficulté
**Fonctionnalités :**
- Sélecteur de difficulté (Facile / Moyen / Difficile) dans Home
- Prompts Claude adaptés selon la difficulté
- Score visible seulement en fin de question (pendingCorrect + flushScore)
- Changement de thème avec sélecteur de difficulté dans Results

**Fichiers impactés :**
`src/claude.js`, `src/components/Home.jsx`, `src/components/Game.jsx`,
`src/components/Results.jsx`

---

### 2026-03-20 — MVP initial
**Fonctionnalités :**
- Page d'accueil : créer une partie (génère questions Claude, écrit dans Firebase) / rejoindre via code
- Lobby : liste des joueurs en temps réel, bouton "Lancer la partie"
- Jeu : timer 10s synchronisé via `timerDepart` Firebase (pas côté client), 4 choix, phase reveal 3s
- Révélation réponse : vert/rouge + animation `celebrate-pulse`
- Classement final : podium top 3, boutons Recommencer / Changer thème / Quitter
- Routing : Home → Lobby → Game → Results
- Synchronisation multijoueur : `onValue`, `runTransaction`, `update`

**Fichiers créés :**
`src/firebase.js`, `src/claude.js`, `src/components/Home.jsx/.css`,
`src/components/Lobby.jsx/.css`, `src/components/Game.jsx/.css`,
`src/components/Results.jsx/.css`, `src/App.jsx`, `src/main.jsx`

---

## Erreurs connues et corrections

*(Ce journal sera mis à jour automatiquement à chaque correction d'erreur.)*
