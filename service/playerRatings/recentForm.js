const { describeParameters, displayName, round } = require("./presentation")

const WINDOWS = [5, 10, 25]

const emptyRecord = () => ({ wins: 0, draws: 0, losses: 0 })

const addToRecord = (record, result) => {
    if (result === 1) record.wins += 1
    else if (result === 0) record.losses += 1
    else record.draws += 1
}

const buildMetric = (entries) => {
    const record = emptyRecord()
    if (entries.length === 0) {
        return {
            matches: 0,
            record,
            actualPercentage: null,
            expectedPercentage: null,
            differencePercentagePoints: null,
            ratingChange: null,
        }
    }

    let actual = 0
    let expected = 0
    let ratingChange = 0
    for (const entry of entries) {
        addToRecord(record, entry.result)
        actual += entry.result
        expected += entry.expected
        ratingChange += entry.delta
    }

    return {
        matches: entries.length,
        record,
        actualPercentage: round((actual / entries.length) * 100),
        expectedPercentage: round((expected / entries.length) * 100),
        differencePercentagePoints: round(
            ((actual - expected) / entries.length) * 100
        ),
        ratingChange: round(ratingChange),
    }
}

const buildWindows = (entries) =>
    Object.fromEntries(
        WINDOWS.map((size) => [size, buildMetric(entries.slice(-size))])
    )

// Agregado global de forma reciente. Cada jugador usa sus propios últimos
// partidos rateables de todo el historial; no comparte un rango temporal con
// los demás y la respuesta no expone eventos ni puntos por partido.
const buildRecentFormPayload = ({
    currentRanking,
    periodEvents,
    config,
    names,
}) => {
    const entriesById = new Map()
    const events = [...periodEvents].sort((a, b) => a.seq - b.seq)

    for (const event of events) {
        for (const [side, isP1] of [
            [event.p1, true],
            [event.p2, false],
        ]) {
            if (!entriesById.has(side.id)) entriesById.set(side.id, [])
            entriesById.get(side.id).push({
                result: isP1 ? event.resultP1 : 1 - event.resultP1,
                expected: isP1 ? event.expectedP1 : 1 - event.expectedP1,
                delta: isP1 ? event.delta : -event.delta,
            })
        }
    }

    return {
        success: true,
        parameters: describeParameters(config),
        data: {
            players: currentRanking.map((player) => ({
                player: {
                    id: player.id,
                    name: displayName(names, player),
                },
                recentForm: buildWindows(entriesById.get(player.id) ?? []),
            })),
        },
    }
}

module.exports = { buildRecentFormPayload }
