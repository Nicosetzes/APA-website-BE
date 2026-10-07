// Recalcula quién ganó y quién perdió un partido jugado a partir de los lados
// guardados (`playerP*`, `teamP*`, `seedP*`). Sirve para que el outcome no
// quede apuntando a un equipo que ya no juega el partido (D6). Es puro: no
// toca goles, empate, penales ni diferencia.

const sameId = (a, b) =>
    a !== null &&
    a !== undefined &&
    b !== null &&
    b !== undefined &&
    String(a) === String(b)

const toScore = (value) => {
    if (value === null || value === undefined || value === "") return null
    const score = Number(value)
    return Number.isFinite(score) ? score : null
}

const side = (match, suffix) => ({
    player: match[`player${suffix}`],
    team: match[`team${suffix}`],
    seed: match[`seed${suffix}`],
})

// Lado ganador de un empate definido por penales: por jugador y, si los dos
// lados son del mismo jugador, por equipo.
const penaltyWinnerSide = (match, outcome) => {
    const playerId = outcome.playerThatWon?.id
    const onP1 = sameId(playerId, match.playerP1?.id)
    const onP2 = sameId(playerId, match.playerP2?.id)
    if (onP1 !== onP2) return onP1 ? "P1" : "P2"

    const teamId = outcome.teamThatWon?.id
    const teamOnP1 = sameId(teamId, match.teamP1?.id)
    const teamOnP2 = sameId(teamId, match.teamP2?.id)
    if (teamOnP1 !== teamOnP2) return teamOnP1 ? "P1" : "P2"

    return null
}

const winnerSide = (match, outcome) => {
    const scoreP1 = toScore(match.scoreP1)
    const scoreP2 = toScore(match.scoreP2)
    if (scoreP1 === null || scoreP2 === null) return null
    if (scoreP1 !== scoreP2) return scoreP1 > scoreP2 ? "P1" : "P2"
    return outcome.penalties === true ? penaltyWinnerSide(match, outcome) : null
}

const participantKey = (value) => String(value?.id ?? "")
const seedKey = (value) => String(value ?? "")

const recomputeOutcomeParticipants = (match) => {
    const outcome = match?.outcome
    const unchanged = { outcome, changed: false }

    if (!match?.played || !outcome || typeof outcome !== "object")
        return unchanged
    if (outcome.draw && !outcome.penalties) return unchanged

    const winnerSuffix = winnerSide(match, outcome)
    if (!winnerSuffix) return unchanged

    const winner = side(match, winnerSuffix)
    const loser = side(match, winnerSuffix === "P1" ? "P2" : "P1")
    const withSeeds =
        "seedFromTeamThatWon" in outcome ||
        "seedFromTeamThatLost" in outcome ||
        (winner.seed !== undefined && winner.seed !== null) ||
        (loser.seed !== undefined && loser.seed !== null)

    const next = {
        ...outcome,
        playerThatWon: winner.player,
        teamThatWon: winner.team,
        playerThatLost: loser.player,
        teamThatLost: loser.team,
    }
    if (withSeeds) {
        next.seedFromTeamThatWon = winner.seed
        next.seedFromTeamThatLost = loser.seed
    }

    const changed =
        participantKey(outcome.playerThatWon) !==
            participantKey(next.playerThatWon) ||
        participantKey(outcome.teamThatWon) !==
            participantKey(next.teamThatWon) ||
        participantKey(outcome.playerThatLost) !==
            participantKey(next.playerThatLost) ||
        participantKey(outcome.teamThatLost) !==
            participantKey(next.teamThatLost) ||
        (withSeeds &&
            (seedKey(outcome.seedFromTeamThatWon) !==
                seedKey(next.seedFromTeamThatWon) ||
                seedKey(outcome.seedFromTeamThatLost) !==
                    seedKey(next.seedFromTeamThatLost)))

    return changed ? { outcome: next, changed: true } : unchanged
}

const asPlain = (value) =>
    typeof value?.toObject === "function" ? value.toObject() : value

// Campos de un update de slots. Si el destino ya está jugado, cambiar sus
// participantes también reescribe ganador y perdedor del outcome.
const withRecomputedOutcome = (dest, fields) => {
    if (!dest?.played) return fields
    const { outcome, changed } = recomputeOutcomeParticipants({
        ...asPlain(dest),
        ...fields,
    })
    return changed ? { ...fields, outcome } : fields
}

module.exports = { recomputeOutcomeParticipants, withRecomputedOutcome }
