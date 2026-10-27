const {
    DEFAULT_HEAD_TO_HEAD_LIMIT,
    MAX_HEAD_TO_HEAD_LIMIT,
    buildHeadToHeadViewPath,
} = require("../../config/assistant")
const { getPlayoffRoundForId } = require("../../config/playoffFormats")
const {
    findAllUsers,
    findHeadToHeadMatchesForAssistant,
    findTournamentsForAssistant,
} = require("./../../dao")
const { getArgentinaToday } = require("../../utils/argentinaDay")
const { omitNil } = require("../../utils/omitNil")
const { comparePlayedAtDesc } = require("../../utils/playedAt")

const CRITERION =
    "Por marcador: un partido empatado en goles cuenta como empate aunque se haya definido por penales (los penales se informan aparte en shootouts). No cuentan los partidos inválidos (W.O., gol de oro, simulados)."

const OBJECT_ID = /^[a-f\d]{24}$/i

const clampLimit = (limit) => {
    const requested = Number(limit)
    if (!Number.isFinite(requested)) return DEFAULT_HEAD_TO_HEAD_LIMIT
    return Math.min(Math.max(Math.trunc(requested), 1), MAX_HEAD_TO_HEAD_LIMIT)
}

const idOf = (player) =>
    player?.id === undefined || player?.id === null ? null : String(player.id)

const isGoals = (value) => Number.isInteger(value) && value >= 0

// Fecha para mostrar, según la precisión con la que se cargó: el día argentino
// del partido, o solo el mes o el año si no se sabe más.
const formatPlayedOn = (playedAt, precision) => {
    const time = playedAt ? new Date(playedAt).getTime() : Number.NaN
    if (Number.isNaN(time)) return null

    const day = getArgentinaToday(new Date(time))

    if (precision === "month") return day.slice(0, 7)
    if (precision === "year") return day.slice(0, 4)
    if (precision === "approx") return `aprox. ${day.slice(0, 7)}`
    return day
}

// Mira un partido desde el lado del jugador A.
const analyze = (raw, playerA) => {
    const aIsP1 = idOf(raw.playerP1) === playerA.id
    const goalsA = aIsP1 ? raw.scoreP1 : raw.scoreP2
    const goalsB = aIsP1 ? raw.scoreP2 : raw.scoreP1
    const result =
        goalsA > goalsB ? "playerA" : goalsA < goalsB ? "playerB" : "draw"

    return {
        raw,
        aIsP1,
        goalsA,
        goalsB,
        result,
        teamA: (aIsP1 ? raw.teamP1 : raw.teamP2)?.name ?? null,
        teamB: (aIsP1 ? raw.teamP2 : raw.teamP1)?.name ?? null,
        playedOn: formatPlayedOn(raw.playedAt, raw.playedAtPrecision),
    }
}

const shootoutOf = (row, playerA, playerB) => {
    const { outcome } = row.raw

    if (row.result !== "draw" || outcome?.penalties !== true) return null

    const winnerId = idOf(outcome.playerThatWon)
    const winner =
        winnerId === playerA.id
            ? playerA
            : winnerId === playerB.id
            ? playerB
            : null

    return {
        winner: winner ? winner.name : null,
        score:
            isGoals(outcome.scoreFromTeamThatWon) &&
            isGoals(outcome.scoreFromTeamThatLost)
                ? `${outcome.scoreFromTeamThatWon}-${outcome.scoreFromTeamThatLost}`
                : null,
    }
}

// Mayor diferencia de gol; a igual diferencia, más goles del ganador; y a
// igual todo, el partido más viejo (el mismo desempate del cara a cara del sitio).
const compareBestWin = (a, b) => {
    const marginA = Math.abs(a.goalsA - a.goalsB)
    const marginB = Math.abs(b.goalsA - b.goalsB)
    if (marginA !== marginB) return marginB - marginA

    const goalsA = Math.max(a.goalsA, a.goalsB)
    const goalsB = Math.max(b.goalsA, b.goalsB)
    if (goalsA !== goalsB) return goalsB - goalsA

    return -comparePlayedAtDesc(a.raw, b.raw)
}

const bestWinOf = (rows, role, players) => {
    const [best] = rows
        .filter((row) => row.result === role)
        .sort(compareBestWin)

    if (!best) return null

    const winnerIsA = role === "playerA"
    const winnerGoals = winnerIsA ? best.goalsA : best.goalsB
    const loserGoals = winnerIsA ? best.goalsB : best.goalsA

    return omitNil({
        playedOn: best.playedOn,
        tournament: best.raw.tournament?.name ?? null,
        stage: best.raw.type ?? null,
        score: `${winnerGoals}-${loserGoals}`,
        winnerTeam: winnerIsA ? best.teamA : best.teamB,
        loserTeam: winnerIsA ? best.teamB : best.teamA,
        winner: players[role].name,
    })
}

// Racha actual: los partidos más recientes seguidos con el mismo resultado.
const streakOf = (rows, players) => {
    if (rows.length === 0) return null

    const [latest] = rows
    let count = 0

    for (const row of rows) {
        if (row.result !== latest.result) break
        count += 1
    }

    return {
        result: latest.result === "draw" ? "draw" : "win",
        player: latest.result === "draw" ? null : players[latest.result].name,
        count,
    }
}

const toRatingChange = (decorated, row) => {
    const change = decorated?.ratingChange

    if (!change || !Number.isFinite(change.p1) || !Number.isFinite(change.p2))
        return null

    return row.aIsP1
        ? { playerA: change.p1, playerB: change.p2 }
        : { playerA: change.p2, playerB: change.p1 }
}

const toLastMatch = ({ row, decorated, tournament, players }) => {
    const { raw } = row
    const winner = row.result === "draw" ? null : players[row.result].name

    return omitNil({
        matchId: String(raw._id),
        playedOn: row.playedOn,
        playedAtPrecision: raw.playedAtPrecision ?? null,
        tournamentId: raw.tournament?.id ? String(raw.tournament.id) : null,
        tournament: raw.tournament?.name ?? null,
        stage: raw.type ?? null,
        group: raw.group ?? null,
        round:
            raw.type === "playoff" && tournament && raw.playoff_id !== undefined
                ? getPlayoffRoundForId(tournament.format, raw.playoff_id)
                : null,
        leg: raw.leg ?? null,
        playerA: { team: row.teamA, goals: row.goalsA },
        playerB: { team: row.teamB, goals: row.goalsB },
        winner,
        shootout: shootoutOf(row, players.playerA, players.playerB),
        ratingChange: toRatingChange(decorated, row),
    })
}

// Arma la respuesta. Pura: no lee la base.
const buildHeadToHeadResponse = ({
    players,
    rows,
    excluded,
    recent,
    now,
    filters = {},
    notes = [],
}) => {
    const { stage = null, tournamentId = null } = filters
    const record = {
        matches: rows.length,
        playerAWins: 0,
        draws: 0,
        playerBWins: 0,
        playerAGoals: 0,
        playerBGoals: 0,
        shootouts: { total: 0, playerAWon: 0, playerBWon: 0 },
    }

    for (const row of rows) {
        record.playerAGoals += row.goalsA
        record.playerBGoals += row.goalsB

        if (row.result === "playerA") record.playerAWins += 1
        else if (row.result === "playerB") record.playerBWins += 1
        else record.draws += 1

        const shootout = shootoutOf(row, players.playerA, players.playerB)

        if (shootout) {
            record.shootouts.total += 1
            if (shootout.winner === players.playerA.name)
                record.shootouts.playerAWon += 1
            else if (shootout.winner === players.playerB.name)
                record.shootouts.playerBWon += 1
        }
    }

    const dated = rows.filter((row) => row.playedOn !== null)
    const responseNotes = [...notes]

    if (rows.length === 0)
        responseNotes.push(
            stage || tournamentId
                ? `${players.playerA.name} y ${players.playerB.name} no se enfrentaron con ese filtro (etapa o torneo).`
                : `${players.playerA.name} y ${players.playerB.name} todavía no se enfrentaron.`
        )

    if (excluded.invalid > 0)
        responseNotes.push(
            `${excluded.invalid} partido(s) inválido(s) entre ambos no cuentan en el balance.`
        )

    return {
        asOf: now.toISOString(),
        players,
        criterion: CRITERION,
        record,
        streak: streakOf(rows, players),
        bestWin: {
            playerA: bestWinOf(rows, "playerA", players),
            playerB: bestWinOf(rows, "playerB", players),
        },
        lastMatches: recent,
        returned: recent.length,
        firstMatchOn: dated.length ? dated.at(-1).playedOn : null,
        lastMatchOn: dated.length ? dated[0].playedOn : null,
        excluded,
        filters: { stage, tournamentId },
        viewPath: buildHeadToHeadViewPath(
            players.playerA.id,
            players.playerB.id,
            { stage, tournamentId }
        ),
        notes: responseNotes,
    }
}

const retrieveAssistantHeadToHead = async (filters, dependencies = {}) => {
    const {
        playerA: playerAId,
        playerB: playerBId,
        stage,
        tournamentId,
        limit,
    } = filters
    const findUsers = dependencies.findAllUsers || findAllUsers
    const findMatches =
        dependencies.findHeadToHeadMatchesForAssistant ||
        findHeadToHeadMatchesForAssistant
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
    const requested = [String(playerAId), String(playerBId)]
    const unknownPlayers = requested.filter((id) => !namesById.has(id))

    if (unknownPlayers.length > 0) {
        return {
            asOf: now.toISOString(),
            players: null,
            unknownPlayers,
            record: null,
            lastMatches: [],
            notes: [
                `No existen jugadores con estos ids: ${unknownPlayers.join(
                    ", "
                )}.`,
            ],
        }
    }

    const players = {
        playerA: { id: requested[0], name: namesById.get(requested[0]) },
        playerB: { id: requested[1], name: namesById.get(requested[1]) },
    }

    const stored = await findMatches({
        playerA: players.playerA.id,
        playerB: players.playerB.id,
        stage,
        tournamentId,
    })

    const excluded = { invalid: 0, incomplete: 0 }
    const rows = []

    for (const raw of stored) {
        if (raw.valid === false) {
            excluded.invalid += 1
            continue
        }

        const row = analyze(raw, players.playerA)

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

    const recent = recentRows.map((row) =>
        toLastMatch({
            row,
            decorated: decoratedById.get(String(row.raw._id)),
            tournament: tournamentsById.get(String(row.raw.tournament?.id)),
            players,
        })
    )

    return buildHeadToHeadResponse({
        players,
        rows,
        excluded,
        recent,
        now,
        filters: { stage, tournamentId },
    })
}

module.exports = retrieveAssistantHeadToHead
module.exports.CRITERION = CRITERION
module.exports.buildHeadToHeadResponse = buildHeadToHeadResponse
module.exports.clampLimit = clampLimit
module.exports.formatPlayedOn = formatPlayedOn
module.exports.analyze = analyze
module.exports.idOf = idOf
module.exports.isGoals = isGoals
module.exports.shootoutOf = shootoutOf
module.exports.toRatingChange = toRatingChange
