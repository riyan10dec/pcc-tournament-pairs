var blossom = require('edmonds-blossom');

// Doesn't account for forfeits yet, still debating on that implementation
// for multi-point scenarios
function getModifiedMedianScores(options, round, participants, matches) {
  matches = matches.filter((match) => match.round < round);
  var mappings = getMappings(participants, matches);
  var points = mappings.reduce((acc, val) => {
    acc[val.id] = val.points;
    return acc;
  }, {});
  var scores = mappings.reduce(
    (acc, history) => {
      history.opponents.forEach((opponent) => {
        // Don't calculate points for null (BYE) opponents
        if (opponent) {
          acc[opponent].scores.push(history.points);
          acc[opponent].points += history.points;
        }
      });
      return acc;
    },
    participants.reduce((acc, participant) => {
      acc[participant.id] = {
        scores: [],
        points: 0,
      };
      return acc;
    }, {})
  );
  var fifty = ((round - 1) * options.maxPerRound) / 2;
  return Object.entries(scores).reduce((acc, [key, value]) => {
    value.scores.sort();
    if (points[key] > fifty) {
      value.scores.shift();
    } else if (points[key] < fifty) {
      value.scores.pop();
    }
    acc[key] = value.scores.reduce((acc, val) => acc + val, 0);
    return acc;
  }, {});
}

function getStandings(options, round, participants, matches) {
  matches = matches.filter((match) => match.round < round);
  // var scores = getModifiedMedianScores(options, round, participants, matches);
  var standings = participants.reduce((standings, participant) => {
    standings[participant.id] = {
      seed: participant.seed,
      wins: 0,
      losses: 0,
      // tiebreaker: scores[participant.id],
      solkov: 0,
      sohne: 0,
    };
    return standings;
  }, {});
  matches.forEach((match) => {
    standings[match.home.id].wins += match.home.points;
    standings[match.home.id].losses += match.away.points;
    // Ignore null opponents/BYEs
    if (match.away.id) {
      standings[match.away.id].wins += match.away.points;
      standings[match.away.id].losses += match.home.points;
    }
  });
  standings = calculateSohneSolkov(standings, matches);
  return Object.entries(standings)
    .reduce((standings, [key, value]) => {
      standings.push({
        id: key,
        seed: value.seed,
        score: value.wins,
        wins: value.wins,
        losses: value.losses,
        // tiebreaker: value.tiebreaker,
        solkov: value.solkov,
        sohne: value.sohne,
      });
      return standings;
    }, [])
    .sort((a, b) => {
      if (a.wins === b.wins) {
        if (a.sohne === b.sohne) {
          if (a.solkov === b.solkov) return b.seed - a.seed;
          else return b.solkov - a.solkov;
        } else return b.sohne - a.sohne;
      } else {
        return b.wins - a.wins;
      }
    });
}
function calculateSohneSolkov(standings, matches) {
  matches.forEach((match) => {
    if (match.away.id) {
      standings[match.home.id].solkov += standings[match.away.id].wins;
      standings[match.away.id].solkov += standings[match.home.id].wins;

      standings[match.home.id].sohne +=
        standings[match.away.id].wins * match.home.points;
      standings[match.away.id].sohne +=
        standings[match.home.id].wins * match.away.points;
    }
  });
  return standings;
}

function getInitialMatch(participants) {
  let matches = [];
  let firstGroups = [];
  let secondGroups = [];
  let i = 0;
  let j = Math.ceil(participants.length / 2);
  while (i < Math.ceil(participants.length / 2)) {
    firstGroups.push(participants[i].id);
    secondGroups.push(participants[j] ? participants[j].id : null);
    i++;
    j++;
  }
  for (let i = 0; i < firstGroups.length; i++) {
    matches.push({ home: firstGroups[i], away: secondGroups[i] });
  }
  return matches;
}

function getMatchups(options, round, participants, matches) {
  if (matches.length === 0) {
    return getInitialMatch(participants);
  }
  matches = matches.filter((match) => match.round < round);
  var mappings = getMappings(participants, matches);

  // because ids are strings but the blossom algorithm needs integers
  // we create maps from int-to-id then set the ids to integers
  var mapIds = new Map();
  var index = 0;
  var homeAwayMap = new Map();
  for (var m of mappings) {
    mapIds.set(index, m.id);
    m.id = index++;
  }

  mappings = mappings.filter((m) => !m.droppedOut);
  if (mappings.length % 2 === 1) {
    // we simulate the bye having played against every team with a bye
    // that way those teams will not get a bye again unless the matches are
    // ridiculously better if they have another
    // we also want it to bias toward giving byes to teams at the bottom
    // of the standings
    mappings.push({
      id: index,
      points: 0,
      seed: 0,
      tiebreaker: 0,
      opponents: mappings
        .filter((m) => {
          return m.opponents.filter((o) => o === null).length > 0;
        })
        .map((m) => mapIds.get(m.id)),
    });
    mapIds.set(index, null);
  }

  homeAwayMap = getHomeAwayMap(mappings);

  // to avoid repeatedly matching the same team up or down repeatedly
  // we shuffle the inputs to the blossom algorithm to counteract
  // any ordering biases it may have
  mappings = shuffle(mappings, round, options.seedMultiplier);
  var arr = mappings.reduce((arr, team, i, orig) => {
    var opps = orig.slice(0, i).concat(orig.slice(i + 1));
    for (var opp of opps) {
      arr.push([
        team.id,
        opp.id,
        -1 *
          (Math.pow(team.points - opp.points, options.standingPower) +
            options.rematchWeight *
              team.opponents.reduce((n, o) => {
                return n + (o === mapIds.get(opp.id));
              }, 0)),
      ]);
    }
    return arr;
  }, []);

  var results = blossom(arr, true);

  var matchups = [];
  // Here we sort matchups by standings so that matchups and standings follow
  // roughly the same order - this doesn't impact funcitonality at all
  // Ordering this in the view layer should be possible, so let's move it there
  // pending review
  var standings = getStandings(options, round, participants, matches);
  var sortedKeys = [...mapIds.keys()].sort((a, b) => {
    // Float BYEs to the end
    if (mapIds.get(a) === null) {
      return 1;
    } else if (mapIds.get(b) === null) {
      return -1;
    }
    return (
      standings.findIndex((s) => s.id === mapIds.get(a)) -
      standings.findIndex((s) => s.id === mapIds.get(b))
    );
  });

  for (var i of sortedKeys) {
    if (
      results[i] !== -1 &&
      !matchups.reduce(
        (n, r) =>
          n ||
          r.home === mapIds.get(results[i]) ||
          r.away === mapIds.get(results[i]),
        false
      )
    ) {
      var hwResult = sortHomeAway([
        homeAwayMap.get(i),
        homeAwayMap.get(results[i]),
      ]);
      matchups.push({
        home: mapIds.get(hwResult.home),
        away: mapIds.get(hwResult.away),
      });
    }
  }
  return matchups;
}

function getMappings(participants, matches) {
  return participants.reduce((acc, participant) => {
    acc.push(
      matches
        .filter((match) => {
          return (
            match.home.id === participant.id || match.away.id === participant.id
          );
        })
        .reduce(
          (acc, match) => {
            if (match.home.id === participant.id) {
              acc.points += match.home.points;
              acc.home = acc.home ? acc.home + 1 : 1;
              acc.last = 'home';
              acc.opponents.push(match.away.id);
            } else if (match.away.id === participant.id) {
              acc.points += match.away.points;
              acc.away = acc.away ? acc.away + 1 : 1;
              acc.last = 'away';
              acc.opponents.push(match.home.id);
            }
            return acc;
          },
          {
            id: participant.id,
            seed: participant.seed,
            droppedOut: participant.droppedOut,
            points: 0,
            opponents: [],
          }
        )
    );
    return acc;
  }, []);
}

//get mapped home away
function getHomeAwayMap(mappings) {
  var keys = new Map();
  for (var i = 0; i < mappings.length; i++) {
    var obj = mappings[i];
    keys.set(obj.id, {
      id: obj.id,
      last: obj.last,
      home: obj.home,
      away: obj.home,
    });
  }
  return keys;
}

//considering home away history
function sortHomeAway(homeAwayMap) {
  var sortedKeys = homeAwayMap.sort((a, b) => {
    if (a.last === 'home' && b.last === 'away') {
      return 1;
    } else if (a.last === 'away' && b.last === 'home') {
      return -1;
    } else if (a.home > b.home) {
      return 1;
    } else if (b.home > a.home) {
      return -1;
    }
  });
  return {
    home: sortedKeys[0].id,
    away: sortedKeys[1].id,
  };
}

// Knuth shuffle from stack overflow
function shuffle(array, seed, multiplier) {
  var currentIndex = array.length;

  // fast, seeded PRNG from stackoverflow
  var s = seed;
  const random = () => {
    var x = (Math.abs((((s++ * multiplier) / Math.PI) % 4) - 2) - 1) * 10000;
    return x - Math.floor(x);
  };

  while (0 !== currentIndex) {
    var randomIndex = Math.floor(random() * currentIndex--);
    var temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }
  return array;
}

module.exports = (options) => {
  options = options || {};
  options.maxPerRound = options.maxPerRound || 1;
  options.rematchWeight = options.rematchWeight || 100;
  options.standingPower = options.standingPower || 2;
  options.seedMultiplier = options.seedMultiplier || 6781;

  return {
    getModifiedMedianScores: getModifiedMedianScores.bind(null, options),
    getStandings: getStandings.bind(null, options),
    getMatchups: getMatchups.bind(null, options),
    getMappings: getMappings,
  };
};
