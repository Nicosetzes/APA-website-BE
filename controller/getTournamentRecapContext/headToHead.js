const CRITERION =
    "Historial por marcador: un partido decidido por penales cuenta como empate. Solo partidos anteriores al primer partido del torneo."

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const pairKey = (idA, idB) => [String(idA), String(idB)].sort().join("|")

// Cara a cara de cada pareja de jugadores que se cruzó en el torneo. Pura.
//
// - `entries`: log de partidos del torneo (ver `matchLog.js`).
// - `ratingMatches`: historial liviano de todos los partidos jugados y válidos
//   (el que ya carga el motor de ratings: `playerP1.id`, `scoreP1`, `playedAt`,
//   `tournament.id`).
// - `firstMatchTime`: ms del primer partido del torneo. Sin él no hay un
//   "antes" confiable y `allTimeBefore` queda en `null`.
// - `final`: `{ championId, runnerUpId }` para marcar la pareja de la final.
const buildHeadToHead = ({
    entries,
    ratingMatches,
    tournamentId,
    firstMatchTime,
    finalists,
}) => {
    const pairs = new Map()

    for (const entry of entries) {
        if (!entry.valid) continue

        const idA = String(entry.p1.playerId)
        const idB = String(entry.p2.playerId)

        if (idA === idB) continue

        const key = pairKey(idA, idB)

        if (!pairs.has(key)) {
            const [first, second] = [
                { id: idA, name: entry.p1.player },
                { id: idB, name: entry.p2.player },
            ].sort((a, b) => (a.id < b.id ? -1 : 1))

            pairs.set(key, {
                players: [first, second],
                inTournament: {
                    matches: 0,
                    aWins: 0,
                    draws: 0,
                    bWins: 0,
                    aGoals: 0,
                    bGoals: 0,
                },
            })
        }

        const pair = pairs.get(key)
        const [a] = pair.players
        const aIsP1 = a.id === idA
        const stats = pair.inTournament

        stats.matches += 1
        stats.aGoals += aIsP1 ? entry.score[0] : entry.score[1]
        stats.bGoals += aIsP1 ? entry.score[1] : entry.score[0]

        if (entry.winner === "draw") stats.draws += 1
        else if ((entry.winner === "p1") === aIsP1) stats.aWins += 1
        else stats.bWins += 1
    }

    const finalKey = finalists
        ? pairKey(finalists.championId, finalists.runnerUpId)
        : null

    return [...pairs.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, pair]) => ({
            players: pair.players,
            inTournament: pair.inTournament,
            allTimeBefore:
                firstMatchTime === null
                    ? null
                    : allTimeBefore({
                          pair,
                          ratingMatches,
                          tournamentId,
                          firstMatchTime,
                      }),
            isFinal: key === finalKey,
        }))
}

const allTimeBefore = ({
    pair,
    ratingMatches,
    tournamentId,
    firstMatchTime,
}) => {
    const [a, b] = pair.players
    const record = { matches: 0, aWins: 0, draws: 0, bWins: 0 }

    for (const match of ratingMatches) {
        if (String(match.tournament?.id) === String(tournamentId)) continue

        const idP1 = String(match.playerP1?.id)
        const idP2 = String(match.playerP2?.id)

        if (pairKey(idP1, idP2) !== pairKey(a.id, b.id)) continue

        // Los partidos sin fecha son históricos: se tratan como anteriores,
        // igual que los ordena el motor de ratings.
        const time = toTime(match.playedAt)

        if (time !== null && time >= firstMatchTime) continue

        record.matches += 1

        if (match.scoreP1 === match.scoreP2) record.draws += 1
        else if (match.scoreP1 > match.scoreP2 === (idP1 === a.id)) {
            record.aWins += 1
        } else record.bWins += 1
    }

    return { criterion: CRITERION, ...record }
}

module.exports = { buildHeadToHead, CRITERION }
