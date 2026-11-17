/*
 * 006: carga el Torneo Argentino 2021 (cancelado) con sus 30 partidos jugados.
 *
 * Se jugó en el FIFA 21 desde el 2021-02-23 y se canceló a fines de marzo de
 * 2021, antes del Torneo Argentino 2021/22. Como los resultados son reales,
 * cuentan para el rating, los mano a mano y las estadísticas; el torneo queda
 * con `valid: false` (igual que Liga Inglesa 2026 y Chempions 2024), así que no
 * aparece en las listas de torneos ni en el Salón de la Fama.
 *
 * Alcance cerrado: inserta 1 torneo y 30 partidos con `_id` fijos. No toca
 * ningún documento existente. Ya aplicada (los 31 `_id` existen) da 0 ops; si
 * existe sólo una parte, bloquea.
 *
 * Fechas: sólo se conoce el inicio (2021-02-23) y el orden. El primer partido
 * va el día de inicio (precisión `day`), el último el 2021-03-31 (`month`) y
 * los del medio repartidos parejo entre esas dos fechas (`approx`), el mismo
 * criterio que se usó con el Torneo Argentino 2021/22.
 *
 * Rollback: `--rollback <before-file>` borra los 31 documentos, salvo los que
 * se hayan editado después del apply (otro `updatedAt`).
 */

const { ObjectId } = require("mongoose").mongo

const { COLLECTIONS } = require("./lib/snapshot")
const { INSERT_KIND, cloneValue } = require("./lib/memory")

const ID = "006-torneo-argentino-2021"
const MATCHES = COLLECTIONS.matches
const TOURNAMENTS = COLLECTIONS.tournaments

const TOURNAMENT_ID = "6afc6d92ef16789aa5c2369b"
const TOURNAMENT_NAME = "Torneo Argentino 2021"

// 12:00 en Argentina (15:00 UTC), como las demás fechas cargadas a mano.
const STARTED_AT = new Date("2021-02-23T15:00:00.000Z")
const CLOSED_AT = new Date("2021-03-31T15:00:00.000Z")

const PLAYERS = Object.freeze({
    Leo: "630ae433d016201eea9354da",
    Lucho: "630b81147c838bf67104d176",
    Max: "632df103ffb8798245034116",
    Santi: "630b546e691957c2170b54da",
})

// id del equipo -> nombre (el mismo que usan los demás partidos) y jugador.
const TEAMS = Object.freeze({
    434: { name: "Gimnasia L.P.", player: "Leo" },
    435: { name: "River Plate", player: "Lucho" },
    436: { name: "Racing Club", player: "Max" },
    437: { name: "Rosario Central", player: "Max" },
    438: { name: "Velez Sarsfield", player: "Lucho" },
    441: { name: "Union Santa Fe", player: "Santi" },
    442: { name: "Defensa Y Justicia", player: "Santi" },
    445: { name: "Huracan", player: "Max" },
    446: { name: "Lanus", player: "Leo" },
    448: { name: "Colon Santa Fe", player: "Lucho" },
    449: { name: "Banfield", player: "Lucho" },
    450: { name: "Estudiantes L.P.", player: "Max" },
    451: { name: "Boca Juniors", player: "Leo" },
    453: { name: "Independiente", player: "Santi" },
    455: { name: "Atletico Tucuman", player: "Santi" },
    457: { name: "Newells Old Boys", player: "Leo" },
    458: { name: "Argentinos JRS", player: "Max" },
    459: { name: "Arsenal Sarandi", player: "Lucho" },
    460: { name: "San Lorenzo", player: "Santi" },
    463: { name: "Aldosivi", player: "Leo" },
})

// En el orden en que se jugaron: [_id, equipo P1, goles P1, equipo P2, goles P2].
const RESULTS = Object.freeze([
    ["6afc6d92ef16789aa5c2369c", 448, 1, 450, 3],
    ["6afc6d92ef16789aa5c2369d", 460, 3, 457, 4],
    ["6afc6d92ef16789aa5c2369e", 453, 4, 459, 0],
    ["6afc6d92ef16789aa5c2369f", 435, 3, 463, 3],
    ["6afc6d92ef16789aa5c236a0", 455, 3, 445, 2],
    ["6afc6d92ef16789aa5c236a1", 437, 2, 442, 3],
    ["6afc6d92ef16789aa5c236a2", 451, 2, 438, 2],
    ["6afc6d92ef16789aa5c236a3", 441, 1, 434, 1],
    ["6afc6d92ef16789aa5c236a4", 458, 1, 446, 2],
    ["6afc6d92ef16789aa5c236a5", 449, 3, 436, 3],
    ["6afc6d92ef16789aa5c236a6", 450, 1, 460, 1],
    ["6afc6d92ef16789aa5c236a7", 448, 2, 453, 2],
    ["6afc6d92ef16789aa5c236a8", 457, 2, 435, 1],
    ["6afc6d92ef16789aa5c236a9", 459, 0, 455, 2],
    ["6afc6d92ef16789aa5c236aa", 463, 1, 437, 0],
    ["6afc6d92ef16789aa5c236ab", 445, 1, 451, 2],
    ["6afc6d92ef16789aa5c236ac", 438, 2, 458, 5],
    ["6afc6d92ef16789aa5c236ad", 434, 1, 449, 0],
    ["6afc6d92ef16789aa5c236ae", 446, 4, 436, 1],
    ["6afc6d92ef16789aa5c236af", 453, 2, 450, 2],
    ["6afc6d92ef16789aa5c236b0", 435, 1, 460, 2],
    ["6afc6d92ef16789aa5c236b1", 455, 1, 448, 1],
    ["6afc6d92ef16789aa5c236b2", 437, 3, 457, 2],
    ["6afc6d92ef16789aa5c236b3", 451, 3, 459, 0],
    ["6afc6d92ef16789aa5c236b4", 441, 1, 463, 2],
    ["6afc6d92ef16789aa5c236b5", 436, 2, 438, 3],
    ["6afc6d92ef16789aa5c236b6", 450, 1, 435, 1],
    ["6afc6d92ef16789aa5c236b7", 442, 1, 446, 2],
    ["6afc6d92ef16789aa5c236b8", 451, 1, 453, 1],
    ["6afc6d92ef16789aa5c236b9", 460, 4, 449, 0],
])

const EXPECTED_MATCHES = 30
const EXPECTED_OPS = EXPECTED_MATCHES + 1

const idKey = (value) =>
    value === null || value === undefined ? null : String(value)
const check = (name, ok, detail = "") => ({ name, ok: Boolean(ok), detail })
const listDetail = (items) =>
    `${items.slice(0, 20).join(", ")}${
        items.length > 20 ? ` (+${items.length - 20})` : ""
    }`

const playerRef = (name) => ({ id: PLAYERS[name], name })
const teamRef = (teamId) => ({ id: teamId, name: TEAMS[teamId].name })

// Primero el día de inicio, último el 2021-03-31 y el resto repartido parejo
// (redondeado al segundo).
const scheduleFor = (index, total) => {
    if (index === 0) return { playedAt: STARTED_AT, playedAtPrecision: "day" }
    if (index === total - 1) {
        return { playedAt: CLOSED_AT, playedAtPrecision: "month" }
    }
    const span = CLOSED_AT.getTime() - STARTED_AT.getTime()
    const offset = Math.round((span * index) / (total - 1) / 1000) * 1000
    return {
        playedAt: new Date(STARTED_AT.getTime() + offset),
        playedAtPrecision: "approx",
    }
}

// Mismas formas que guarda la app hoy para un partido regular.
const buildOutcome = (p1, scoreP1, p2, scoreP2) => {
    if (scoreP1 === scoreP2) return { draw: true, penalties: false }
    const [winner, loser] = scoreP1 > scoreP2 ? [p1, p2] : [p2, p1]
    return {
        playerThatWon: winner.player,
        teamThatWon: winner.team,
        scoreFromTeamThatWon: winner.score,
        playerThatLost: loser.player,
        teamThatLost: loser.team,
        scoreFromTeamThatLost: loser.score,
        draw: false,
        scoringDifference: winner.score - loser.score,
    }
}

const buildMatch = ([id, teamP1, scoreP1, teamP2, scoreP2], index, now) => {
    const p1 = {
        player: playerRef(TEAMS[teamP1].player),
        team: teamRef(teamP1),
        score: scoreP1,
    }
    const p2 = {
        player: playerRef(TEAMS[teamP2].player),
        team: teamRef(teamP2),
        score: scoreP2,
    }
    return {
        _id: new ObjectId(id),
        playerP1: p1.player,
        teamP1: p1.team,
        scoreP1,
        playerP2: p2.player,
        teamP2: p2.team,
        scoreP2,
        type: "regular",
        tournament: { id: TOURNAMENT_ID, name: TOURNAMENT_NAME },
        played: true,
        outcome: buildOutcome(p1, scoreP1, p2, scoreP2),
        ...scheduleFor(index, RESULTS.length),
        schemaVersion: 1,
        __v: 0,
        createdAt: now,
        updatedAt: now,
    }
}

const buildTournament = (now) => ({
    _id: new ObjectId(TOURNAMENT_ID),
    name: TOURNAMENT_NAME,
    players: Object.keys(PLAYERS).map(playerRef),
    teams: Object.keys(TEAMS)
        .map(Number)
        .sort((a, b) => a - b)
        .map((teamId) => ({
            team: teamRef(teamId),
            player: playerRef(TEAMS[teamId].player),
        })),
    ongoing: false,
    format: "league",
    valid: false,
    legacy: false,
    daily_recap: {},
    startedAt: STARTED_AT,
    startedAtPrecision: "day",
    closedAt: CLOSED_AT,
    closedAtPrecision: "month",
    schemaVersion: 1,
    __v: 0,
    // Como Chempions 2019/20: `createdAt` es el inicio real (los listados
    // ordenan por `createdAt`); `updatedAt`, el momento de la carga.
    createdAt: STARTED_AT,
    updatedAt: now,
})

const insertOp = (collection, document, group, rule) => ({
    kind: INSERT_KIND,
    collection,
    _id: document._id,
    filter: { _id: document._id },
    document,
    group,
    rule,
    before: null,
    after: cloneValue(document),
})

// Nombres de jugadores y equipos tal como figuran en los partidos existentes.
const collectKnownNames = (matches) => {
    const players = new Map()
    const teams = new Map()
    matches.forEach((match) => {
        ;["P1", "P2"].forEach((side) => {
            const player = match[`player${side}`]
            const team = match[`team${side}`]
            if (player?.id) {
                const names = players.get(String(player.id)) || new Set()
                names.add(player.name)
                players.set(String(player.id), names)
            }
            if (team?.id !== undefined && team?.id !== null) {
                const names = teams.get(String(team.id)) || new Set()
                names.add(team.name)
                teams.set(String(team.id), names)
            }
        })
    })
    return { players, teams }
}

// Por id de jugador (el reporte nunca lleva nombres de jugadores) y de equipo.
const tally = (documents) => {
    const perPlayer = {}
    const perTeam = {}
    const bump = (table, key, field) => {
        table[key] = table[key] || { played: 0, won: 0, drawn: 0, lost: 0 }
        table[key].played += 1
        table[key][field] += 1
    }
    documents.forEach((match) => {
        const sides = [
            [match.playerP1.id, match.teamP1.id, match.scoreP1, match.scoreP2],
            [match.playerP2.id, match.teamP2.id, match.scoreP2, match.scoreP1],
        ]
        sides.forEach(([player, team, scored, conceded]) => {
            const field =
                scored > conceded ? "won" : scored < conceded ? "lost" : "drawn"
            bump(perPlayer, player, field)
            bump(perTeam, team, field)
        })
    })
    return { perPlayer, perTeam }
}

const plan = (snapshot, context = {}) => {
    const now = context.now
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new Error(`${ID}: context.now tiene que ser una fecha`)
    }

    const tournament = buildTournament(now)
    const matches = RESULTS.map((row, index) => buildMatch(row, index, now))
    const ourMatchIds = new Set(matches.map((match) => idKey(match._id)))

    const existingMatchIds = new Set(
        snapshot.matches.map((match) => idKey(match._id))
    )
    const existingTournamentIds = new Set(
        snapshot.tournaments.map((item) => idKey(item._id))
    )
    const presentMatches = matches.filter((match) =>
        existingMatchIds.has(idKey(match._id))
    )
    const tournamentPresent = existingTournamentIds.has(TOURNAMENT_ID)
    const presentCount = presentMatches.length + (tournamentPresent ? 1 : 0)
    const alreadyApplied = presentCount === EXPECTED_OPS
    const partiallyApplied = presentCount > 0 && !alreadyApplied

    const ops = alreadyApplied
        ? []
        : [
              insertOp(
                  TOURNAMENTS,
                  tournament,
                  "tournament",
                  "torneo cancelado (valid: false)"
              ),
              ...matches.map((match) =>
                  insertOp(MATCHES, match, "matches", "partido jugado")
              ),
          ]

    const checks = []
    checks.push(
        check(
            "los 31 _id no existen (o ya existen todos: aplicada)",
            !partiallyApplied,
            partiallyApplied
                ? `ya existen ${presentCount} de ${EXPECTED_OPS}`
                : ""
        ),
        check(
            `${EXPECTED_MATCHES} partidos en la carga`,
            matches.length === EXPECTED_MATCHES,
            `hay ${matches.length}`
        )
    )

    const sameName = snapshot.tournaments.filter(
        (item) =>
            item.name === TOURNAMENT_NAME && idKey(item._id) !== TOURNAMENT_ID
    )
    checks.push(
        check(
            `ningún otro torneo se llama ${TOURNAMENT_NAME}`,
            !sameName.length,
            listDetail(sameName.map((item) => idKey(item._id)))
        )
    )

    const foreignMatches = snapshot.matches.filter(
        (match) =>
            idKey(match?.tournament?.id) === TOURNAMENT_ID &&
            !ourMatchIds.has(idKey(match._id))
    )
    checks.push(
        check(
            "0 partidos ajenos con el tournament.id nuevo",
            !foreignMatches.length,
            listDetail(foreignMatches.map((match) => idKey(match._id)))
        )
    )

    // Jugadores y equipos: los ids y nombres tienen que coincidir con los de
    // los partidos existentes (el snapshot nunca lee `users`).
    const known = collectKnownNames(
        snapshot.matches.filter((match) => !ourMatchIds.has(idKey(match._id)))
    )
    const badPlayers = Object.entries(PLAYERS).filter(
        ([name, id]) => !known.players.get(id)?.has(name)
    )
    const badTeams = Object.entries(TEAMS).filter(
        ([id, team]) => !known.teams.get(id)?.has(team.name)
    )
    checks.push(
        check(
            "jugadores con id y nombre ya usados en otros partidos",
            !badPlayers.length,
            listDetail(badPlayers.map(([name, id]) => `${name} (${id})`))
        ),
        check(
            "equipos con id y nombre ya usados en otros partidos",
            !badTeams.length,
            listDetail(badTeams.map(([id, team]) => `${team.name} (${id})`))
        )
    )

    const samePlayer = matches.filter(
        (match) => match.playerP1.id === match.playerP2.id
    )
    checks.push(
        check(
            "0 partidos entre equipos del mismo jugador",
            !samePlayer.length,
            listDetail(samePlayer.map((match) => idKey(match._id)))
        )
    )

    const outOfOrder = matches.filter(
        (match, index) =>
            index > 0 &&
            match.playedAt.getTime() <= matches[index - 1].playedAt.getTime()
    )
    checks.push(
        check(
            "playedAt estrictamente creciente en el orden de juego",
            !outOfOrder.length,
            listDetail(outOfOrder.map((match) => idKey(match._id)))
        )
    )

    // Otros partidos jugados en la misma ventana (informativo: se espera 0).
    const overlapping = snapshot.matches.filter((match) => {
        if (ourMatchIds.has(idKey(match._id)) || !match.playedAt) return false
        const time = new Date(match.playedAt).getTime()
        return time >= STARTED_AT.getTime() && time <= CLOSED_AT.getTime()
    })

    const { perPlayer, perTeam } = tally(matches)

    return {
        ops,
        report: {
            summary: {
                tournamentId: TOURNAMENT_ID,
                name: TOURNAMENT_NAME,
                alreadyApplied,
                toInsert: {
                    tournaments: ops.length ? 1 : 0,
                    matches: ops.length ? matches.length : 0,
                },
                window: {
                    from: STARTED_AT.toISOString(),
                    to: CLOSED_AT.toISOString(),
                },
                perPlayer,
                perTeam,
            },
            byTournament: [
                {
                    tournamentId: TOURNAMENT_ID,
                    name: TOURNAMENT_NAME,
                    toChange: ops.length,
                },
            ],
            checks,
            needsConfirmation: [],
            notes: [
                {
                    kind: "ratingsRecompute",
                    informational: true,
                    ids: [],
                    detail: "después del apply hay que correr npm run recompute:ratings (cambia el rating de todos los partidos posteriores)",
                },
                ...(overlapping.length
                    ? [
                          {
                              kind: "overlappingMatches",
                              informational: true,
                              ids: overlapping.map((match) => idKey(match._id)),
                              detail: "partidos existentes jugados en la misma ventana de fechas",
                          },
                      ]
                    : []),
            ],
            evidence: {
                matchIds: matches.map((match) => idKey(match._id)),
            },
        },
    }
}

const createMigration = () => ({
    id: ID,
    title: "Alta del Torneo Argentino 2021 (cancelado) y sus 30 partidos",
    dependsOn: [],
    collections: [TOURNAMENTS, MATCHES],
    plan: (snapshot, context) => plan(snapshot, context),
})

module.exports = {
    ...createMigration(),
    CLOSED_AT,
    PLAYERS,
    RESULTS,
    STARTED_AT,
    TEAMS,
    TOURNAMENT_ID,
    TOURNAMENT_NAME,
    createMigration,
}
