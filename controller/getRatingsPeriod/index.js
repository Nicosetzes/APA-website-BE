const {
    describeParameters,
    displayName,
    round,
} = require("../../service/playerRatings/presentation")
const { findBiggestUpset } = require("../../service/playerRatings/upsets")
const { createPeriodSource } = require("./periodSource")

// Arma el cuerpo de la respuesta a partir de los dos rankings (en `start` y en
// `end`) y los eventos del período. Lo usan los dos caminos (en vivo y desde lo
// guardado), así que el payload es idéntico por construcción.
const buildPeriodPayload = ({
    previousRanking,
    currentRanking,
    periodEvents,
    config,
    names,
    dateFrom,
    dateTo,
}) => {
    const initial = config.initialRating
    const previousById = new Map(
        previousRanking.map((player) => [player.id, player])
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

    return {
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
    }
}

const createGetRatingsPeriod = (dependencies = {}) => {
    const readPeriod = createPeriodSource(dependencies)

    return async (req, res) => {
        const { dateFrom, dateTo } = req.query
        const source = await readPeriod({
            dateFrom,
            dateTo,
            endpoint: "ratings_period",
        })

        return res.json(buildPeriodPayload({ ...source, dateFrom, dateTo }))
    }
}

const getRatingsPeriod = createGetRatingsPeriod()

module.exports = getRatingsPeriod
module.exports.createGetRatingsPeriod = createGetRatingsPeriod
module.exports.buildPeriodPayload = buildPeriodPayload
