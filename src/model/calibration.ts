/**
 * Toutes les constantes du modèle de séchage. Aucun nombre magique ailleurs.
 * Unités : mm d'eau, °C, %, km/h, W/m², heures.
 *
 * Les valeurs « physiques » viennent de la littérature (FAO-56, Penman 1948).
 * Les valeurs « terrain » sont calées sur les scénarios de drying.test.ts,
 * eux-mêmes tirés du repère de l'utilisateur :
 *   « pas de pluie la veille ni le jour même → bowl presque sec, petites flaques au milieu ».
 */
export const CAL = {
  physics: {
    /** kPa/°C — constante psychrométrique à ~400 m d'altitude (FAO-56, éq. 8). */
    gamma: 0.065,
    /** W/m² pour évaporer 1 mm/h : λ = 2.45 MJ/kg → 2.45e6 / 3600. */
    wattsPerMmHour: 680,
    /** Vent 10 m → 2 m : 4.87 / ln(67.8 × 10 − 5.42) (FAO-56, éq. 47). */
    windTo2m: 0.748,
    /** Fonction de vent de Penman (1948) : f(u) = a × (1 + b × u2), en mm/jour/hPa. */
    penmanWindA: 0.26,
    penmanWindB: 0.54,
    /** Perte infrarouge nette (W/m²) par ciel clair et par ciel couvert. */
    netLongwaveClear: 75,
    netLongwaveOvercast: 15,
    /** cm de neige → mm d'eau (convention Open-Meteo : 7 cm de neige ≈ 10 mm d'eau). */
    snowCmToMm: 10 / 7,
    /** Fonte : cm/h par °C au-dessus de 0, plus une part radiative (cm/h par W/m²). */
    meltPerDegree: 0.1,
    meltPerWatt: 0.001,
  },

  /** À partir de ce cumul horaire (mm), on considère qu'il pleut. */
  rainHour: 0.1,
  /** Température de l'air (°C) sous laquelle une surface humide peut geler. */
  iceTemp: 1,
  /** Probabilité de pluie (%) à partir de laquelle une heure future est « risque d'averse ». */
  riskProbability: 40,

  /** Rosée : nuit claire et calme, air proche de la saturation. */
  dew: {
    maxCloud: 30, // %
    maxWind: 8, // km/h
    maxSpread: 1.5, // °C entre température et point de rosée
    rate: 0.02, // mm/h déposés (0.1–0.3 mm par nuit, ordre de grandeur classique)
    max: 0.08, // mm — reste sous le seuil « mouillé » : la rosée rend rideable, pas mouillé
  },

  /** Route du lac : bitume plat, ruisselle et sèche vite. */
  route: {
    albedo: 0.12, // bitume
    sun: 1.0, // part du rayonnement reçue (peu d'ombre sur les quais)
    capacity: 0.3, // mm retenus dans la texture, le reste ruisselle
    dry: 0.02, // mm — sous ce film : sec
    wet: 0.12, // mm — au-dessus : mouillé
  },

  /** Bowl de Vidy : béton lissé, parois qui égouttent vers un fond qui garde les flaques. */
  bowl: {
    albedo: 0.25, // béton
    sun: 0.7, // parois souvent à l'ombre (soleil bas une bonne partie de l'année)
    wallCapacity: 0.3, // mm retenus sur les parois
    wallDry: 0.02,
    wallWet: 0.12,
    runoffToBottom: 0.3, // part du ruissellement des parois qui finit en flaques (rapport de surfaces)
    bottomCapacity: 4, // mm max dans les flaques (au-delà : évacuation)
    bottomEvap: 0.8, // flaques au fond, plus à l'ombre que les parois
    drain: 0.04, // mm/h d'infiltration/évacuation lente (fissures, grille)
    puddles: 0.15, // mm — au-dessus : « flaques au fond »
    flooded: 2.0, // mm — au-dessus : fond inondé, pas rideable
  },

  /** Retour terrain : ajuste la vitesse de séchage du spot. */
  feedback: { up: 1.2, down: 0.8, soft: 0.9, min: 0.5, max: 2 },
} as const
