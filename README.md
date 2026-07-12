# crous-watcher

Surveille automatiquement la disponibilité de logements CROUS (Rennes, ≤450€, seul) toutes les 5 minutes et envoie une notification push dès qu'un logement correspondant apparaît.

Le script interroge directement l'API JSON utilisée par [trouverunlogement.lescrous.fr](https://trouverunlogement.lescrous.fr) (pas de scraping HTML fragile, pas besoin de compte/connexion).

## 1. Installer l'app de notification (ntfy)

1. Installe l'app **ntfy** : [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iOS](https://apps.apple.com/us/app/ntfy/id1625396347) / ou utilise [ntfy.sh/app](https://ntfy.sh/app) dans un navigateur.
2. Dans l'app, ajoute un abonnement ("Subscribe to topic") avec exactement ce nom (garde-le secret, c'est ce qui protège tes notifications) :

   ```
   crous-rennes-jofUPRRxGNS2
   ```

3. Tu peux tester tout de suite avec :
   ```bash
   curl -d "Test notification" https://ntfy.sh/crous-rennes-jofUPRRxGNS2
   ```
   Tu dois recevoir une notification sur ton téléphone.

## 2. Créer le dépôt GitHub

1. Crée un nouveau dépôt sur [github.com/new](https://github.com/new) — **public** de préférence (les minutes GitHub Actions sont illimitées et gratuites sur les dépôts publics ; en privé tu es limité à 2000 min/mois, ce qui peut être consommé en quelques jours avec un run toutes les 5 min). Rien de sensible n'est stocké dans le code (le topic ntfy reste secret, voir étape 3).
2. Pousse ce dossier dedans :
   ```bash
   cd crous-watcher
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<ton-utilisateur>/<ton-repo>.git
   git push -u origin main
   ```

## 3. Ajouter le secret NTFY_TOPIC

Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**
- Nom : `NTFY_TOPIC`
- Valeur : `crous-rennes-jofUPRRxGNS2`

## 4. Autoriser le workflow à commiter

Le workflow sauvegarde son état (logements déjà vus) en committant `state.json`. Il faut l'autoriser :

**Settings → Actions → General → Workflow permissions** → coche **"Read and write permissions"** → Save.

## 5. C'est parti

Le workflow (`.github/workflows/watch.yml`) tourne automatiquement toutes les 5 minutes dès que c'est poussé sur `main`. Tu peux aussi le lancer manuellement dans l'onglet **Actions** du dépôt (bouton "Run workflow").

Dès qu'un logement correspondant aux critères apparaît, tu reçois une notification push avec l'adresse, le loyer et le lien direct vers l'annonce.

## Notes importantes

- **Délai réel** : GitHub annonce un intervalle minimum de 5 minutes pour les cron, mais l'exécution peut être retardée de quelques minutes en cas de forte charge sur leur infrastructure — ce n'est pas garanti à la seconde près.
- **Pas de désactivation automatique** : GitHub désactive normalement les workflows planifiés après 60 jours sans activité sur le dépôt. Le script contourne ça en committant un horodatage à chaque run, donc pas d'action de ta part nécessaire.
- **Modifier les critères de recherche** : édite les constantes en haut de [`watch.js`](watch.js) (`MAX_PRICE_EUROS`, `OCCUPATION_MODES`, `BOUNDS`) si tu veux changer la ville, le prix max ou le mode d'occupation. Les coordonnées `BOUNDS` viennent du paramètre `bounds=...` de l'URL de recherche sur trouverunlogement.lescrous.fr.
- **Arrêter la surveillance** : une fois que tu as trouvé un logement, désactive le workflow dans l'onglet Actions (bouton "..." → "Disable workflow"), ou supprime le dépôt.
