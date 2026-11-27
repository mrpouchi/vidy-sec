# Vidy Sec

Est-ce que le **bowl de Vidy** et la **route du lac Ouchy → UNIL** sont secs ? Et sinon, quand ?

Une page pensée pour l'iPhone (ajoutable à l'écran d'accueil), plus une notification ntfy chaque
matin, et une mise à jour seulement si la prévision change dans la journée.

## Comment ça estime

Ce n'est pas une mesure, c'est une simulation heure par heure de l'eau en surface :

- **Données** : prévisions MeteoSwiss ICON-CH1 / ICON-CH2 via [Open-Meteo](https://open-meteo.com/)
  (5 jours d'historique + 7 jours de prévision), fusionnées heure par heure.
- **Apports** : pluie, fonte de neige, rosée (nuit claire et calme).
- **Séchage** : évaporation de Penman pour une surface mouillée (soleil, vent, air sec, chaleur).
- **Bowl** : deux réservoirs. Les parois sèchent vite ; le fond garde des flaques qui sèchent lentement.
- **Route** : un film d'eau mince sur le bitume, qui sèche vite.

Les constantes sont toutes dans [`src/model/calibration.ts`](src/model/calibration.ts), commentées.
Les scénarios de calibrage (dont le repère terrain « pas de pluie la veille ni le jour même →
bowl presque sec, petites flaques au milieu ») sont dans
[`src/model/drying.test.ts`](src/model/drying.test.ts) : `npm test`.

Le bouton « Tu y es ? Sec / Mouillé » ajuste la vitesse de séchage sur ton téléphone. « Copier mes
retours » (en bas de page) exporte le journal pour recalibrer les valeurs par défaut.

## Développer

```bash
npm install
npm run dev        # http://localhost:5173/vidy-sec/
npm test
npm run notify -- --dry-run   # affiche la notification du moment sans l'envoyer
```

## Notifications

`.github/workflows/notify.yml` tourne toutes les heures. Il a besoin du secret `NTFY_TOPIC`.
L'état (dernier message envoyé) est commité dans `state/notify.json` ; ces commits gardent aussi le
repo actif, sinon GitHub désactive les tâches planifiées après 60 jours sans activité.
Pour forcer un envoi : *Actions → Notification → Run workflow → force*.
