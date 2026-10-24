# HC/HP Card

Carte Lovelace pour Home Assistant — Contrat EDF Heures Creuses / Heures Pleines.

**Configuration 100 % visuelle** : aucun YAML à écrire, tout se configure via l'éditeur de carte intégré.

## Fonctionnalités

- 🌙 / ☀️ Détection HC/HP en temps réel selon l'heure
- 🗓️ Plages différentes par type de jour : **Semaine · Mercredi · Week-end · Jours fériés**
- 🇫🇷 Jours fériés français calculés automatiquement (Pâques inclus)
- ⚡ Puissance instantanée avec barre colorée (🟢 normal · 🟠 moyen · 🔴 élevé)
- 📊 Consommation et coût estimé : jour / semaine / mois / an
- ⏱️ Countdown avant le prochain basculement HC ↔ HP

## Installation via HACS

1. HACS → **Ressources Frontend** → ⋮ → Dépôts personnalisés
2. Ajouter l'URL de ce dépôt, catégorie **Lovelace**
3. Installer **HC/HP Card**
4. Recharger le navigateur (Ctrl+Maj+R)

## Ajouter la carte

1. Tableau de bord → **Modifier** → **Ajouter une carte**
2. Chercher **HC/HP Card**
3. Configurer via l'éditeur visuel :
   - Nom de la carte
   - Capteur de puissance (sensor en W depuis votre Linky ou compteur)
   - Capteur d'énergie (optionnel, sensor en kWh pour les stats)
   - Prix HC et HP (vérifiez votre contrat EDF)
   - Plages HC pour chaque type de jour
   - Seuils de puissance pour les couleurs

## Configuration minimale (YAML)

Si vous préférez le YAML :

```yaml
type: custom:hchp-card
name: Tarif HC/HP
power_entity: sensor.linky_puissance_instant
energy_entity: sensor.linky_index_total   # optionnel
prices:
  hc: 0.1296
  hp: 0.1609
schedules:
  weekday:
    hc:
      - start: "22:30"
        end: "06:30"
  wednesday:
    hc:
      - start: "22:30"
        end: "06:30"
      - start: "13:00"
        end: "17:00"
  weekend:
    hc:
      - start: "00:00"
        end: "07:00"
  holiday:
    hc:
      - start: "00:00"
        end: "24:00"
thresholds:
  low: 1000      # W — vert
  medium: 3000   # W — orange
  high: 6000     # W — rouge
```

> Les plages à cheval sur minuit sont gérées (ex : 22:30 → 06:30).

## Capteur d'énergie recommandé

Pour les statistiques de consommation, utilisez un capteur de type `sensor` avec une classe `energy` et une unité `kWh`. Si vous avez l'intégration **ENEDIS / Linky**, ce capteur est généralement disponible automatiquement.

## Licence

MIT — libre d'utilisation et de modification.
