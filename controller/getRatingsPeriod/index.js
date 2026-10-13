const { getArgentinaDayRange } = require("../../utils/argentinaDay")
const {
    buildNameIndex,
    describeParameters,
    displayName,
    round,
    toIso,
} = require("../../service/playerRatings/presentation")
const {
    calculatePlayerRatings,
    rankPlayers,
    snapshotBefore,
} = require("../../service/playerRatings")
const { retrieveAllMatches, retrieveAllUsers } = require("./../../service")

// La sorpresa del período: el partido con ganador que el Elo menos esperaba.
// Los empates y los penales no cuentan, y si el favorito ganó siempre no hay
// sorpresa.
const findBiggestUpset = (periodEvents, names) => {
    let upset = null

    for (const event of periodEvents) {
        if (event.resultP1 === 0.5) continue

        const p1Won = event.resultP1 === 1
        const winnerExpected = p1Won ? event.expectedP1 : 1 - event.expectedP1

        if (
            winnerExpected < 0.5 &&
            (!upset || winnerExpected < upset.expected)
        ) {
            upset = { event, p1Won, expected: winnerExpected }
        }
    }

    if (!upset) return null

    const { event, p1Won, expected } = upset
    const winner = p1Won ? event.p1 : event.p2
    const loser = p1Won ? event.p2 : event.p1

    return {
        matchId: event.matchId,
        playedAt: toIso(event.time),
        tournament: event.tournament,
        type: event.type,
        winner: { id: winner.id, name: displayName(names, winner) },
        loser: { id: loser.id, name: displayName(names, loser) },
        score: {
            winner: p1Won ? event.scoreP1 : event.scoreP2,
            loser: p1Won ? event.scoreP2 : event.scoreP1,
        },
        // Puntaje esperado por el Elo, no la probabilidad de ganar: el empate
        // cuenta como 0,5. Incluye el término de fuerza de equipo cuando hay
        // overall de ambos equipos (rating 2.0).
        winnerExpectedScore: round(expected, 3),
        ratingSwing: round(Math.abs(event.delta)),
    }
}

const createGetRatingsPeriod = (dependencies = {}) => {
    const retrieveMatches =
        dependencies.retrieveAllMatches || retrieveAllMatches
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers

    return async (req, res) => {
        const { dateFrom, dateTo } = req.query
        const start = getArgentinaDayRange(dateFrom).start.getTime()
        const end = getArgentinaDayRange(dateTo).end.getTime()

        const [matches, users] = await Promise.all([
            retrieveMatches(),
            retrieveUsers(),
        ])

        const names = buildNameIndex(users || [])
        const { events, config } = calculatePlayerRatings(matches || [])
        const initial = config.initialRating

        const previousRanking = rankPlayers(
            snapshotBefore(events, start, initial)
        )
        const currentRanking = rankPlayers(snapshotBefore(events, end, initial))
        const previousById = new Map(
            previousRanking.map((player) => [player.id, player])
        )

        const periodEvents = events.filter(
            (event) =>
                event.time !== null && event.time >= start && event.time < end
        )
        const periodById = new Map()
        for (const event of periodEvents) {
            for (const [side, result] of [
                [event.p1, event.resultP1],
                [event.p2, 1 - event.resultP1],
            ]) {
                const record = periodById.get(side.id) ?? {
                    matches: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                }
                record.matches += 1
                if (result === 1) record.wins += 1
                else if (result === 0) record.losses += 1
                else record.draws += 1
                periodById.set(side.id, record)
            }
        }

        const players = currentRanking.map((player) => {
            const previous = previousById.get(player.id) ?? null
            const record = periodById.get(player.id) ?? {
                matches: 0,
                wins: 0,
                draws: 0,
                losses: 0,
            }

            return {
                position: player.position,
                previousPosition: previous?.position ?? null,
                // Positivo: subió lugares en el ranking.
                positionChange: previous
                    ? previous.position - player.position
                    : null,
                player: { id: player.id, name: displayName(names, player) },
                rating: round(player.rating),
                previousRating: previous ? round(previous.rating) : null,
                ratingChange: round(
                    player.rating - (previous ? previous.rating : initial)
                ),
                matchesInPeriod: record.matches,
                record: {
                    wins: record.wins,
                    draws: record.draws,
                    losses: record.losses,
                },
                provisional: player.matches < config.provisionalMatches,
            }
        })

        return res.json({
            success: true,
            dateFrom,
            dateTo,
            parameters: describeParameters(config),
            data: {
                matchesInPeriod: periodEvents.length,
                players,
                highlights: {
                    biggestUpset: findBiggestUpset(periodEvents, names),
                },
            },
        })
    }
}

const getRatingsPeriod = createGetRatingsPeriod()

module.exports = getRatingsPeriod
module.exports.createGetRatingsPeriod = createGetRatingsPeriod
