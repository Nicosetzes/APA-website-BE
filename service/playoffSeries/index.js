const {
    getFinalPlayoffId,
    getPlayoffRoundIdRange,
} = require("../../config/playoffFormats")
const { HttpError } = require("../../middleware/httpErrors")

const PLAYOFF_MODES = ["single", "two_legged"]
const VALID_LEGS = [1, 2, 3]

const normalizePlayoffMode = (tournament = {}) =>
    tournament.playoffMode ?? "single"

const normalizeLeg = (match = {}) => match.leg ?? 1

const toCompetitorUnit = (match, side) => ({
    team: match[`team${side}`],
    player: match[`player${side}`],
    seed: match[`seed${side}`],
})

const isEntityReference = (value) =>
    value !== null &&
    typeof value === "object" &&
    value.id !== undefined &&
    typeof value.name === "string" &&
    value.name.trim().length > 0

const assertCompleteUnit = (unit) => {
    if (
        !unit ||
        !isEntityReference(unit.team) ||
        !isEntityReference(unit.player) ||
        unit.seed === undefined ||
        unit.seed === null ||
        String(unit.seed).length === 0
    ) {
        throw new HttpError(
            409,
            "PLAYOFF_SERIES_NOT_READY",
            "La unidad competidora está incompleta"
        )
    }

    return unit
}

const sameReference = (left, right) =>
    left?.id !== undefined &&
    right?.id !== undefined &&
    String(left.id) === String(right.id)

const sameUnit = (left, right) =>
    sameReference(left?.team, right?.team) &&
    sameReference(left?.player, right?.player) &&
    String(left?.seed) === String(right?.seed)

const placeCompetitorUnit = (target, side, unit) => ({
    ...target,
    [`team${side}`]: unit?.team ?? null,
    [`player${side}`]: unit?.player ?? null,
    [`seed${side}`]: unit?.seed ?? null,
})

const classifySeriesMatch = ({ tournament, match } = {}) => {
    if (
        tournament?.format !== "playoff" ||
        match?.type !== "playoff" ||
        match.leg === undefined
    ) {
        return "legacy"
    }

    if (
        !PLAYOFF_MODES.includes(tournament.playoffMode) ||
        !VALID_LEGS.includes(match.leg) ||
        (match.playoff_id === 31 && match.leg !== 1)
    ) {
        return "invalid"
    }

    if (
        tournament.playoffMode === "two_legged" &&
        match.playoff_id !== 31 &&
        match.leg < 3
    ) {
        return "series_leg"
    }

    return "decisive"
}

const createDomainError = (code, message, status = 400) =>
    new HttpError(status, code, message)

const isPhysicalResultEquivalent = (match, body, outcome) => {
    if (
        !match?.played ||
        Number(body.scoreP1) !== Number(match.scoreP1) ||
        Number(body.scoreP2) !== Number(match.scoreP2)
    ) {
        return false
    }

    if (
        body.valid !== undefined &&
        Boolean(body.valid) !== (match.valid !== false)
    ) {
        return false
    }

    const fields = [
        "draw",
        "penalties",
        "scoringDifference",
        "scoreFromTeamThatWon",
        "scoreFromTeamThatLost",
    ]
    if (
        fields.some(
            (field) =>
                String(match.outcome?.[field] ?? "") !==
                String(outcome?.[field] ?? "")
        )
    ) {
        return false
    }

    return [
        "teamThatWon",
        "teamThatLost",
        "playerThatWon",
        "playerThatLost",
    ].every(
        (field) =>
            String(match.outcome?.[field]?.id ?? "") ===
            String(outcome?.[field]?.id ?? "")
    )
}

const unitIsEmpty = (unit) =>
    !unit?.team &&
    !unit?.player &&
    (unit?.seed === undefined || unit.seed === null)

const unitsMatchOrAreEmpty = (left, right) =>
    (unitIsEmpty(left) && unitIsEmpty(right)) || sameUnit(left, right)

const assertSeriesStructure = (tournament, tieMatches = []) => {
    if (!tournament || tournament.format !== "playoff") {
        throw createDomainError(
            "PLAYOFF_CONFIGURATION_ERROR",
            "La serie no pertenece a un torneo de playoff",
            409
        )
    }

    const ordered = [...tieMatches].sort((left, right) => left.leg - right.leg)
    const legs = ordered.map(({ leg }) => leg)
    const playoffId = ordered[0]?.playoff_id
    const finalId = getFinalPlayoffId("playoff")
    const expectedBaseLegs =
        tournament.playoffMode === "two_legged" && playoffId !== finalId
            ? [1, 2]
            : [1]
    const validLegs =
        legs.length === expectedBaseLegs.length &&
        legs.every((leg, index) => leg === expectedBaseLegs[index])
    const validLegsWithTiebreak =
        expectedBaseLegs.length === 2 &&
        legs.length === 3 &&
        legs.every((leg, index) => leg === [1, 2, 3][index])

    if (
        !PLAYOFF_MODES.includes(tournament.playoffMode) ||
        !Number.isInteger(playoffId) ||
        (!validLegs && !validLegsWithTiebreak) ||
        ordered.some(
            (match) =>
                match.type !== "playoff" || match.playoff_id !== playoffId
        )
    ) {
        throw createDomainError(
            "PLAYOFF_CONFIGURATION_ERROR",
            "La serie no tiene el conjunto exacto de piernas esperado",
            409
        )
    }

    const first = ordered[0]
    if (!Number.isInteger(first.seriesRevision) || first.seriesRevision < 0) {
        throw createDomainError(
            "PLAYOFF_CONFIGURATION_ERROR",
            "La serie no tiene una revisión canónica válida",
            409
        )
    }

    const firstP1 = toCompetitorUnit(first, "P1")
    const firstP2 = toCompetitorUnit(first, "P2")
    for (const candidate of [firstP1, firstP2]) {
        if (!unitIsEmpty(candidate)) assertCompleteUnit(candidate)
    }
    if (
        !unitIsEmpty(firstP1) &&
        !unitIsEmpty(firstP2) &&
        sameReference(firstP1.team, firstP2.team)
    ) {
        throw createDomainError(
            "PLAYOFF_CONFIGURATION_ERROR",
            "Una serie no puede enfrentar al mismo equipo",
            409
        )
    }

    const second = ordered.find(({ leg }) => leg === 2)
    if (
        second &&
        (!unitsMatchOrAreEmpty(firstP1, toCompetitorUnit(second, "P2")) ||
            !unitsMatchOrAreEmpty(firstP2, toCompetitorUnit(second, "P1")))
    ) {
        throw createDomainError(
            "PLAYOFF_CONFIGURATION_ERROR",
            "La vuelta no conserva las unidades competidoras invertidas",
            409
        )
    }

    const tiebreak = ordered.find(({ leg }) => leg === 3)
    if (
        tiebreak &&
        (!unitsMatchOrAreEmpty(firstP1, toCompetitorUnit(tiebreak, "P1")) ||
            !unitsMatchOrAreEmpty(firstP2, toCompetitorUnit(tiebreak, "P2")))
    ) {
        throw createDomainError(
            "PLAYOFF_CONFIGURATION_ERROR",
            "El desempate no conserva las unidades competidoras",
            409
        )
    }

    return ordered
}

const validateParticipants = (match, body) => {
    for (const side of ["P1", "P2"]) {
        const persisted = toCompetitorUnit(match, side)
        assertCompleteUnit(persisted)

        if (
            !sameReference(persisted.team, body[`team${side}`]) ||
            !sameReference(persisted.player, body[`player${side}`]) ||
            (body[`seed${side}`] !== undefined &&
                String(body[`seed${side}`]) !== String(persisted.seed))
        ) {
            throw createDomainError(
                "PLAYOFF_COMPETITOR_CONFLICT",
                "Los participantes no coinciden con el partido almacenado",
                409
            )
        }

        body[`seed${side}`] = persisted.seed
    }
}

const validateSeriesResultRequest = ({
    tournament,
    match,
    tieMatches = [],
    body,
}) => {
    const classification = classifySeriesMatch({ tournament, match })

    if (classification === "legacy") return { classification }
    if (classification === "invalid") {
        throw createDomainError(
            "PLAYOFF_CONFIGURATION_ERROR",
            "La configuración de la serie de playoff es inválida",
            409
        )
    }

    assertSeriesStructure(tournament, tieMatches)
    validateParticipants(match, body)

    const hasPenaltyP1 = body.penaltyScoreP1 !== undefined
    const hasPenaltyP2 = body.penaltyScoreP2 !== undefined
    const hasPenalties = hasPenaltyP1 || hasPenaltyP2

    if (hasPenaltyP1 !== hasPenaltyP2) {
        throw createDomainError(
            "PENALTIES_INCOMPLETE",
            "Deben informarse los dos resultados por penales"
        )
    }

    if (classification === "series_leg") {
        if (hasPenalties) {
            throw createDomainError(
                "PENALTIES_NOT_ALLOWED",
                "La ida y la vuelta no admiten penales"
            )
        }

        if (match.leg === 2) {
            const firstLeg = tieMatches.find((item) => item.leg === 1)
            if (!firstLeg?.played) {
                throw createDomainError(
                    "PLAYOFF_SERIES_NOT_READY",
                    "La ida debe jugarse antes de la vuelta",
                    409
                )
            }
        }
    } else {
        const isDraw = Number(body.scoreP1) === Number(body.scoreP2)
        if (isDraw && !hasPenalties) {
            throw createDomainError(
                "PENALTIES_REQUIRED",
                "El partido decisivo empatado requiere penales"
            )
        }
        if (
            isDraw &&
            Number(body.penaltyScoreP1) === Number(body.penaltyScoreP2)
        ) {
            throw createDomainError(
                "PENALTIES_TIED",
                "El resultado por penales debe definir un ganador"
            )
        }
        if (!isDraw && hasPenalties) {
            throw createDomainError(
                "PENALTIES_WITH_REGULATION_WINNER",
                "No se admiten penales cuando hay un ganador reglamentario"
            )
        }

        if (match.leg === 3) {
            const firstTwo = tieMatches.filter((item) =>
                [1, 2].includes(item.leg)
            )
            const state = calculateSeriesState(firstTwo)
            if (
                firstTwo.length !== 2 ||
                firstTwo.some((item) => !item.played) ||
                state.status !== "awaiting_tiebreak"
            ) {
                throw createDomainError(
                    "PLAYOFF_SERIES_NOT_READY",
                    "El desempate requiere ida y vuelta jugadas con global empatado",
                    409
                )
            }
        }
    }

    return { classification }
}

const calculatePhysicalOutcome = ({ match, body, decisive = false }) => {
    const scoreP1 = Number(body.scoreP1)
    const scoreP2 = Number(body.scoreP2)
    const draw = scoreP1 === scoreP2

    if (draw && !decisive) return { draw: true, penalties: false }

    const penalties = draw
    const p1Won = penalties
        ? Number(body.penaltyScoreP1) > Number(body.penaltyScoreP2)
        : scoreP1 > scoreP2
    const winnerSide = p1Won ? "P1" : "P2"
    const loserSide = p1Won ? "P2" : "P1"
    const winnerScore = penalties
        ? Number(body[`penaltyScore${winnerSide}`])
        : Number(body[`score${winnerSide}`])
    const loserScore = penalties
        ? Number(body[`penaltyScore${loserSide}`])
        : Number(body[`score${loserSide}`])

    const outcome = {
        playerThatWon: match[`player${winnerSide}`],
        teamThatWon: match[`team${winnerSide}`],
        scoreFromTeamThatWon: winnerScore,
        playerThatLost: match[`player${loserSide}`],
        teamThatLost: match[`team${loserSide}`],
        scoreFromTeamThatLost: loserScore,
        draw: penalties,
        seedFromTeamThatWon: match[`seed${winnerSide}`],
        seedFromTeamThatLost: match[`seed${loserSide}`],
    }

    if (penalties) outcome.penalties = true
    else outcome.scoringDifference = Math.abs(scoreP1 - scoreP2)

    return outcome
}

const calculateSeriesState = (matches = []) => {
    const ordered = [...matches].sort(
        (left, right) => normalizeLeg(left) - normalizeLeg(right)
    )
    const firstLeg = ordered.find((match) => normalizeLeg(match) === 1)
    const secondLeg = ordered.find((match) => normalizeLeg(match) === 2)
    const tiebreak = ordered.find((match) => normalizeLeg(match) === 3)
    const units = firstLeg
        ? [toCompetitorUnit(firstLeg, "P1"), toCompetitorUnit(firstLeg, "P2")]
        : []
    const unitsComplete =
        units.length === 2 &&
        units.every((unit) => isEntityReference(unit.team))
    if (!unitsComplete) return { status: "awaiting_leg1", aggregate: [] }

    const aggregateByTeam = new Map(units.map((unit) => [unit.team.id, 0]))

    for (const match of [firstLeg, secondLeg]) {
        if (!match?.played) continue
        for (const side of ["P1", "P2"]) {
            const teamId = match[`team${side}`]?.id
            if (teamId === undefined) continue
            aggregateByTeam.set(
                teamId,
                (aggregateByTeam.get(teamId) || 0) +
                    Number(match[`score${side}`])
            )
        }
    }

    const aggregate = units.map((unit) => ({
        teamId: unit.team.id,
        score: aggregateByTeam.get(unit.team.id) || 0,
    }))

    if (!firstLeg?.played) return { status: "awaiting_leg1", aggregate }
    if (secondLeg && !secondLeg.played)
        return { status: "awaiting_leg2", aggregate }

    if (!secondLeg) {
        if (!firstLeg.outcome?.teamThatWon)
            return { status: "awaiting_leg1", aggregate }
        return {
            status: "decided",
            aggregate,
            winner: units.find((unit) =>
                sameReference(unit.team, firstLeg.outcome.teamThatWon)
            ),
        }
    }

    const [left, right] = aggregate
    if (left.score !== right.score) {
        return {
            status: "decided",
            aggregate,
            winner: left.score > right.score ? units[0] : units[1],
        }
    }

    if (!tiebreak?.played)
        return { status: "awaiting_tiebreak", aggregate, winner: null }

    return {
        status: "decided",
        aggregate,
        winner: units.find((unit) =>
            sameReference(unit.team, tiebreak.outcome?.teamThatWon)
        ),
    }
}

const getSuccessorDescriptor = (id) => {
    if (!Number.isInteger(id) || id < 1 || id > 31) return null
    if (id === 31) return null

    const rounds = ["round_of_32", "round_of_16", "quarterfinal", "semifinal"]
    const range = rounds
        .map((round) => getPlayoffRoundIdRange("playoff", round))
        .find(([start, end]) => id >= start && id <= end)
    if (!range) return null

    const [start, end] = range
    const offset = id - start
    return {
        destinationPlayoffId: end + 1 + Math.floor(offset / 2),
        logicalSide: offset % 2 === 0 ? "P1" : "P2",
    }
}

const buildLegsForTie = ({
    tournament,
    playoffId,
    unitA,
    unitB,
    seriesRevision = 0,
}) => {
    const tournamentRef = {
        id: String(tournament._id || tournament.id),
        name: tournament.name,
    }
    const base = {
        type: "playoff",
        tournament: tournamentRef,
        played: false,
        playoff_id: playoffId,
    }
    const first = placeCompetitorUnit(
        placeCompetitorUnit({ ...base, leg: 1, seriesRevision }, "P1", unitA),
        "P2",
        unitB
    )

    if (
        normalizePlayoffMode(tournament) !== "two_legged" ||
        playoffId === getFinalPlayoffId("playoff")
    ) {
        return [first]
    }

    const second = placeCompetitorUnit(
        placeCompetitorUnit({ ...base, leg: 2 }, "P1", unitB),
        "P2",
        unitA
    )
    return [first, second]
}

const deriveMutationPolicy = ({
    match,
    tieMatches = [],
    successorMatches = [],
    tournament = {},
}) => {
    const laterPlayedLeg = tieMatches.some(
        (candidate) =>
            Number(candidate.leg) > Number(match.leg) && candidate.played
    )
    if (laterPlayedLeg) {
        return {
            canEditResult: false,
            canDeleteResult: false,
            reason: "later_leg_played",
        }
    }

    let advanced = false
    const descriptor = getSuccessorDescriptor(match.playoff_id)
    if (!descriptor)
        advanced = tournament.ongoing === false || !!tournament.outcome
    else {
        const successorFirst = successorMatches.find((item) => item.leg === 1)
        advanced = Boolean(successorFirst?.[`team${descriptor.logicalSide}`])
    }

    return {
        canEditResult: !advanced,
        canDeleteResult: !advanced,
        reason: advanced ? "series_advanced" : null,
    }
}

const assertDirectPlayoffGeometry = (teams, players) => {
    const fail = (message) => {
        throw createDomainError("INVALID_PLAYOFF_GEOMETRY", message)
    }
    if (!Array.isArray(teams) || teams.length !== 32)
        fail("El playoff debe tener exactamente 32 equipos")

    const playerIds = new Set((players || []).map(({ id }) => String(id)))
    const teamIds = new Set()
    const counts = new Map()

    for (const entry of teams) {
        if (
            !entry ||
            !isEntityReference(entry.team) ||
            !isEntityReference(entry.player) ||
            !playerIds.has(String(entry.player.id)) ||
            !Number.isInteger(entry.playoff_id) ||
            entry.playoff_id < 1 ||
            entry.playoff_id > 16
        ) {
            fail("Cada slot debe tener equipo, jugador y playoff_id válidos")
        }
        const teamId = entry.team.id
        if (teamIds.has(teamId)) fail("Cada equipo puede aparecer una sola vez")
        teamIds.add(teamId)
        counts.set(entry.playoff_id, (counts.get(entry.playoff_id) || 0) + 1)
    }

    for (let id = 1; id <= 16; id += 1) {
        if (counts.get(id) !== 2)
            fail("Cada playoff_id del 1 al 16 debe aparecer dos veces")
    }

    return true
}

const decoratePlayoffSeriesMatches = (tournament, matches = []) => {
    const plainMatches = matches.map((match) =>
        typeof match?.toObject === "function" ? match.toObject() : { ...match }
    )
    if (tournament?.format !== "playoff" || !tournament.playoffMode)
        return plainMatches

    const groups = new Map()
    const invalidIds = new Set()
    for (const match of plainMatches) {
        const classification = classifySeriesMatch({ tournament, match })
        if (classification === "legacy") continue
        const key = match.playoff_id
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(match)
        if (classification === "invalid") invalidIds.add(key)
    }

    const metadataById = new Map()
    for (const [playoffId, tieMatches] of groups) {
        try {
            if (invalidIds.has(playoffId)) {
                throw createDomainError(
                    "PLAYOFF_CONFIGURATION_ERROR",
                    "La configuración de la serie de playoff es inválida",
                    409
                )
            }
            assertSeriesStructure(tournament, tieMatches)
            const state = calculateSeriesState(tieMatches)
            const revision = tieMatches.find(
                (match) => match.leg === 1
            ).seriesRevision
            const descriptor = getSuccessorDescriptor(playoffId)
            const successorMatches = descriptor
                ? groups.get(descriptor.destinationPlayoffId) || []
                : []
            const showAggregate =
                tournament.playoffMode === "two_legged" && playoffId !== 31
            for (const match of tieMatches) {
                metadataById.set(String(match._id), {
                    series: {
                        key: `${String(
                            tournament._id || tournament.id
                        )}:${playoffId}`,
                        revision,
                        status: state.status,
                        aggregate: showAggregate ? state.aggregate : [],
                        winnerTeamId: state.winner?.team?.id ?? null,
                    },
                    mutation: deriveMutationPolicy({
                        match,
                        tieMatches,
                        successorMatches,
                        tournament,
                    }),
                })
            }
        } catch (error) {
            if (
                ![
                    "PLAYOFF_CONFIGURATION_ERROR",
                    "PLAYOFF_SERIES_NOT_READY",
                ].includes(error?.code)
            ) {
                throw error
            }
            for (const match of tieMatches) {
                metadataById.set(String(match._id), {
                    seriesError: {
                        code: error.code,
                        message: error.message,
                    },
                    mutation: {
                        canEditResult: false,
                        canDeleteResult: false,
                        reason: "configuration_error",
                    },
                })
            }
        }
    }

    return plainMatches.map((match) => ({
        ...match,
        ...(metadataById.get(String(match._id)) || {}),
    }))
}

module.exports = {
    PLAYOFF_MODES,
    VALID_LEGS,
    assertCompleteUnit,
    assertDirectPlayoffGeometry,
    assertSeriesStructure,
    buildLegsForTie,
    calculatePhysicalOutcome,
    calculateSeriesState,
    classifySeriesMatch,
    deriveMutationPolicy,
    decoratePlayoffSeriesMatches,
    getSuccessorDescriptor,
    isPhysicalResultEquivalent,
    normalizeLeg,
    normalizePlayoffMode,
    placeCompetitorUnit,
    sameUnit,
    toCompetitorUnit,
    validateSeriesResultRequest,
}
