const {
    DEFAULT_RECENT_MATCHES_LIMIT,
    MAX_RECENT_MATCHES_LIMIT,
    buildPlayerMatchesViewPath,
} = require("../../config/assistant")
const { getPlayoffRoundForId } = require("../../config/playoffFormats")
const {
    findAllUsers,
    findRecentMatchesForAssistant,
    findTournamentsForAssistant,
} = require("./../../dao")
const { omitNil } = require("../../utils/omitNil")
const { comparePlayedAtDesc } = require("../../utils/playedAt")
const {
    roundPoints,
} = require("../ratingsReadModel/createRetrieveRatingChanges")
const {
    analyze,
    idOf,
    isGoals,
    shootoutOf,
    toRatingChange,
} = require("../retrieveAssistantHeadToHead")

const CRITERION =
    "Por marcador: un partido empatado en goles cuenta como empate aunque se haya definido por penales (los penales se informan aparte en shootout). No cuentan los partidos inválidos (W.O., gol de oro, simulados). ratingChange son los puntos de APA Rating que ganó o perdió el jugador en ese partido; null si no hay dato."

const OBJECT_ID = /^[a-f\d]{24}$/i

const RESULT_BY_ROW = { playerA: "win", draw: "draw", playerB: "loss" }

const clampLimit = (limit) => {
    const requested = Number(limit)
    if (!Number.isFinite(requested)) return DEFAULT_RECENT_MATCHES_LIMIT
    return Math.min(
        Math.max(Math.trunc(requested), 1),
        MAX_RECENT_MATCHES_LIMIT
    )
}

const toRecentMatch = ({ row, decorated, tournament, player, opponent }) => {
    const { raw } = row

    return {
        ...omitNil({
            playedOn: row.playedOn,
            tournament: raw.tournament?.name ?? null,
            stage: raw.type ?? null,
            group: raw.group ?? null,
            round:
                raw.type === "playoff" &&
                tournament &&
                raw.playoff_id !== undefined
                    ? getPlayoffRoundForId(tournament.format, raw.playoff_id)
                    : null,
            leg: raw.leg ?? null,
            opponent: opponent.name,
            playerTeam: row.teamA,
            opponentTeam: row.teamB,
            score: `${row.goalsA}-${row.goalsB}`,
            result: RESULT_BY_ROW[row.result],
            shootout: shootoutOf(row, player, opponent),
        }),
        // A diferencia del resto, se envía siempre: `null` le dice al modelo
        // que no hay dato, en lugar de dejarlo adivinar.
        ratingChange: toRatingChange(decorated, row)?.playerA ?? null,
    }
}

// Referencia compacta a un partido, para "el partido donde más perdí".
const toRatingRef = (match) =>
    omitNil({
        playedOn: match.playedOn,
        tournament: match.tournament,
        opponent: match.opponent,
        score: match.score,
        result: match.result,
        points: match.ratingChange,
    })

// Resumen de los partidos devueltos. Pura. `matches` viene del más nuevo al más
// viejo: ante igualdad de puntos se queda el más nuevo (comparación estricta).
// Un cambio de 0 no es ni pérdida ni ganancia.
const buildRecentMatchesSummary = (matches) => {
    const record = { matches: matches.length, wins: 0, draws: 0, losses: 0 }
    const withData = []
    let loss = null
    let gain = null
    let total = 0

    for (const match of matches) {
        if (match.result === "win") record.wins += 1
        else if (match.result === "loss") record.losses += 1
        else record.draws += 1

        if (!Number.isFinite(match.ratingChange)) continue

        withData.push(match)
        total += match.ratingChange

        if (
            match.ratingChange < 0 &&
            (!loss || match.ratingChange < loss.ratingChange)
        )
            loss = match
        if (
            match.ratingChange > 0 &&
            (!gain || match.ratingChange > gain.ratingChange)
        )
            gain = match
    }

    return {
        record,
        ratingChangeTotal: withData.length > 0 ? roundPoints(total) : null,
        withoutRatingChange: matches.length - withData.length,
        biggestRatingLoss: loss ? toRatingRef(loss) : null,
        biggestRatingGain: gain ? toRatingRef(gain) : null,
    }
}

const retrieveAssistantRecentMatches = async (filters, dependencies = {}) => {
    const { player: playerId, stage, tournamentId, limit } = filters
    const findUsers = dependencies.findAllUsers || findAllUsers
    const findMatches =
        dependencies.findRecentMatchesForAssistant ||
        findRecentMatchesForAssistant
    const findTournaments =
        dependencies.findTournamentsForAssistant || findTournamentsForAssistant
    // El cambio de rating es un adorno: sin esta dependencia no se informa.
    const addRatingChanges =
        dependencies.addRatingChanges || (async (matches) => matches)
    const now = dependencies.now?.() ?? new Date()
    const effectiveLimit = clampLimit(limit)

    const users = Array.from((await findUsers()) || [])
    const namesById = new Map(
        users.map((user) => [String(user.id ?? user._id), user.nickname])
    )
    const requested = String(playerId)

    if (!namesById.has(requested)) {
        return {
            asOf: now.toISOString(),
            player: null,
            unknownPlayers: [requested],
            record: null,
            matches: [],
            notes: [`No existe un jugador con este id: ${requested}.`],
        }
    }

    const player = { id: requested, name: namesById.get(requested) }

    const stored = await findMatches({ player: player.id, stage, tournamentId })

    const excluded = { invalid: 0, incomplete: 0 }
    const rows = []

    for (const raw of stored) {
        if (raw.valid === false) {
            excluded.invalid += 1
            continue
        }

        const row = analyze(raw, player)

        if (!isGoals(row.goalsA) || !isGoals(row.goalsB)) {
            excluded.incomplete += 1
            continue
        }

        rows.push(row)
    }

    rows.sort((a, b) => comparePlayedAtDesc(a.raw, b.raw))

    const recentRows = rows.slice(0, effectiveLimit)
    const decorated = Array.from(
        (await addRatingChanges(recentRows.map((row) => row.raw))) || []
    )
    const decoratedById = new Map(
        decorated.map((match) => [String(match._id), match])
    )

    const tournamentIds = [
        ...new Set(
            recentRows
                .map((row) => row.raw.tournament?.id)
                .filter((id) => id && OBJECT_ID.test(String(id)))
                .map(String)
        ),
    ]
    const tournaments =
        tournamentIds.length > 0 ? await findTournaments({ tournamentIds }) : []
    const tournamentsById = new Map(
        tournaments.map((tournament) => [String(tournament._id), tournament])
    )

    const matches = recentRows.map((row) => {
        const opponentSide = row.aIsP1 ? row.raw.playerP2 : row.raw.playerP1
        const opponentId = idOf(opponentSide)

        return toRecentMatch({
            row,
            decorated: decoratedById.get(String(row.raw._id)),
            tournament: tournamentsById.get(String(row.raw.tournament?.id)),
            player,
            opponent: {
                id: opponentId,
                name: namesById.get(opponentId) ?? opponentSide?.name ?? null,
            },
        })
    })

    const summary = buildRecentMatchesSummary(matches)
    const notes = []

    if (rows.length === 0)
        notes.push(
            stage || tournamentId
                ? `${player.name} no tiene partidos jugados con ese filtro (etapa o torneo).`
                : `${player.name} no tiene partidos jugados.`
        )

    if (excluded.invalid > 0)
        notes.push(
            `${excluded.invalid} partido(s) inválido(s) de ${player.name} no cuentan.`
        )

    if (summary.withoutRatingChange > 0)
        notes.push(
            `${summary.withoutRatingChange} de ${matches.length} partido(s) no tienen dato de variación de rating: no cuentan en el total ni en la mayor pérdida o ganancia.`
        )

    return {
        asOf: now.toISOString(),
        player: { name: player.name },
        criterion: CRITERION,
        totalMatches: rows.length,
        returned: matches.length,
        ...summary,
        matches,
        excluded,
        filters: { stage: stage ?? null, tournamentId: tournamentId ?? null },
        viewPath: buildPlayerMatchesViewPath(player.id, {
            stage,
            tournamentId,
        }),
        notes,
    }
}

module.exports = retrieveAssistantRecentMatches
module.exports.CRITERION = CRITERION
module.exports.buildRecentMatchesSummary = buildRecentMatchesSummary
module.exports.clampLimit = clampLimit
