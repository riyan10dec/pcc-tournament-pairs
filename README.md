# pcc-tournament-pairs

pcc-tournament-pairs is a tiny swiss pairing library with basic deterministic functionality

## Installation

- `npm install --save pcc-tournament-pairs`
- `require('pcc-tournament-pairs')(options)`
  - `options` contains the following variables:
    - `maxPointsPerRound` - the number of points a participant can score in a
      round - usually 1 or 2
      - default: `1`
    - `rematchWeight` - rematch penalty weight
      - default: `100`
    - `standingPower` - the power to which standings differences should be
      raised
      - default: `2`
    - `seedMultiplier` - the deterministic PRNG seed multiplier, ideally a prime
      of at least 4 digits
      - default: `6781`
  - See `test/test.js` for usage example

## Usage

pcc-tournament-pairs exposes the following three methods:

### getMatchups(round, participants, matches)

See `participants` and `matches` formats below.

Determines the matchups for the given round by pairing participants:

- who have **not** faced each other
- in order of:
  - highest standing/score to lowest
  - highest sohnebern-berger to lowest
  - highest solkov to lowest
  - highest seed to lowest
- where the highest ranked team in a pair is given the `home` side

When byes are needed (in the case of an odd number of participants), they bubble
up from the lowest to the highest ranking, (starting with the lowest seed when
no match history is available). participants cannot have more than one bye.

Matchups returned are in the form:

```javascript
[
  {
    'home': home_participant_id,
    'away': away_participant_id
  },
  ...
]
```

### getStandings(round, participants, matches)

See `participants` and `matches` formats below.

Determines the standings for a given round by accumulating won points and lost
points and calculating modified median scores. Standings are ordered by wins,
modified median score, and seed in that order.

Standings returned are in the form:

```javascript
[
  {
    'id': participant_id,
    'seed': seed,
    'wins': won_points,
    'losses': lost_points,
    'sohne': sohne_points,
    'solkov': solkov_points,
  },
  ...
]
```

### `participants` argument

The participants argument expects an array in the form:

```javascript
[
  {
    id: participant_id,
    seed: participant_seed,
  },
];
```

- `participant_id` may be any value that exposes a toString method (and can
  therefore be used as a key on a javascript object)
- `participant_seed` may be any directly sortable value, although numeric values
  are suggested for reliability

### `matches` argument

The matches argument expects an array in the form:

```javascript
[
  {
    round: match_round,
    home: {
      id: home_participant_id,
      points: home_won_points,
    },
    away: {
      id: away_participant_id,
      points: away_won_points,
    },
  },
];
```

- `match_round` must be a value sortable against the given `currentRound`
  argument - all `matches` will be limited to those where the `round` is less than
  the `currentRound`
- `home_participant_id` and `away_participant_id` may be any values that
  javascript is capable of using as an object key and **must** exist in the given
  `teams` argument
- `home_points_won` and `away_points_won` _should_ be numeric values, but
  currently can be anything that can be accumulated against `0 + ...` and compared
  against numeric values - there are also no checks against whether or not these
  values overrun `maxPerRound` and any data that does overrun `maxPerRound` will
  likely result in strange or erroneous results from every function in this
  library
