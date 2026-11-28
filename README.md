# Spot Checker

Est-ce que le **bowl de Vidy** et le **pumptrack de Leysin** sont secs ? Et sinon, quand ?
(La route du lac Ouchy → UNIL est retirée pour l'instant : `RETIRED_SPOTS` dans `src/model/spots.ts`.)

Une app web pensée pour l'iPhone (à ajouter à l'écran d'accueil), avec une notification chaque
matin vers 8h, et une mise à jour seulement si la prévision change dans la journée.

## Comment ça estime

Ce n'est pas une mesure, c'est une simulation heure par heure de l'eau en surface :

- **Données** : prévisions MeteoSwiss ICON-CH1 / ICON-CH2 via [Open-Meteo](https://open-meteo.com/)
  (5 jours d'historique + 7 jours de prévision), fusionnées heure par heure.
- **Apports** : pluie, fonte de neige, rosée (nuit claire et calme).
- **Séchage** : évaporation de Penman pour une surface mouillée (soleil, vent, air sec, chaleur).
- **Bowl** : deux réservoirs. Les parois sèchent vite ; le fond garde des flaques qui sèchent lentement.
- **Enrobé** (pumptrack, route) : un film d'eau mince sur le bitume, qui sèche vite.

Les constantes sont toutes dans [`src/model/calibration.ts`](src/model/calibration.ts), commentées.
Les scénarios de calibrage (dont le repère terrain « pas de pluie la veille ni le jour même →
bowl presque sec, petites flaques au milieu ») sont dans
[`src/model/drying.test.ts`](src/model/drying.test.ts) : `npm test`.

Le bouton « Tu y es ? Sec / Mouillé » ajuste la vitesse de séchage du spot sur le téléphone, et
envoie un retour anonyme au Worker (spot, constat, prévision, heure ; ni IP ni abonnement), gardé
un an. Ces retours servent à recalibrer les valeurs par défaut : `GET /reports` avec `ADMIN_TOKEN`.

## Développer

```bash
npm install
npm run dev        # http://localhost:5173/spot-checker/
npm test
```

## Notifications

Web Push standard, sans service tiers : sur iPhone (iOS ≥ 16.4), ouvrir l'app depuis l'écran
d'accueil et appuyer sur « Activer les notifications ».

Un Worker Cloudflare ([`worker/index.ts`](worker/index.ts)) garde les abonnements (KV) et tourne
toutes les heures. La décision (message du jour, mises à jour, max 3 / jour) est dans
[`src/notify/plan.ts`](src/notify/plan.ts) ; le chiffrement Web Push (RFC 8291 / VAPID) est en
WebCrypto pur dans [`src/notify/webpush.ts`](src/notify/webpush.ts). Seule l'adresse de
notification de l'appareil est stockée : ni nom, ni e-mail.

```bash
npm run worker:deploy                      # déployer le Worker
npx wrangler secret put VAPID_PRIVATE      # clé privée VAPID (une fois)
npx wrangler secret put ADMIN_TOKEN        # pour POST /run (envoi forcé de test)
```

## Photos des spots

Chacun peut publier une photo d'un spot (bouton « Ajouter » de la carte Photos). L'app la
redimensionne et la réencode avant l'envoi (≤ 1280 px, JPEG, sans métadonnées ni GPS). Les photos
sont publiques, stockées en KV et supprimées automatiquement après 7 jours.

Modération : le propriétaire (clé KV `owners`) reçoit chaque photo en notification avec un lien de
suppression ; une photo signalée 2 fois est masquée. Voir [`worker/photos.ts`](worker/photos.ts).

## Compteur d'utilisateurs

Anonyme : chaque appareil tire un identifiant au hasard et se signale une fois par jour au Worker
(`POST /ping`, mode `app` si installée sur l'écran d'accueil, sinon `web`). Aucune donnée
personnelle ; les signaux expirent après 90 jours. Chiffres : `GET /stats` avec `ADMIN_TOKEN`.
Sur iPhone, Safari et l'app installée comptent comme deux appareils (mémoires séparées).
