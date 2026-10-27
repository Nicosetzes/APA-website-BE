const { getCompetition } = require("../../config/tournamentRecap")

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const playerKey = (player) =>
    player?.id !== undefined && player?.id !== null
        ? String(player.id)
        : String(player?.name ?? "")

const identity = (player) => player?.name ?? null

// Aclaración que viaja en el contexto para que el agente no malinterprete los
// contadores (ver `emptyCounters`).
const COUNTS_SCOPE =
    "Los contadores incluyen este torneo; `beforeThisTournament` es lo mismo sin él. `runnerUps`: subcampeonatos de cualquier formato (también `league`) en torneos que el jugador no ganó. `titlesAndRunnerUps` = titles + runnerUps, torneos distintos. `finals*`: solo formatos con final (todos menos `league`). `sameCompetition`: lo mismo solo en la familia de `competition`."

// Orden de títulos: `closedAt` ascendente y, a igual fecha, `_id`. Un torneo
// sin `closedAt` va primero (se asume viejo) y genera una advertencia.
const compareTournaments = (a, b) => {
    const timeA = toTime(a.closedAt)
    const timeB = toTime(b.closedAt)

    if (timeA !== timeB) {
        if (timeA === null) return -1
        if (timeB === null) return 1
        return timeA - timeB
    }

    const idA = String(a._id)
    const idB = String(b._id)

    if (idA === idB) return 0
    return idA < idB ? -1 : 1
}

// Torneos que cuentan como título: los mismos que lista el Salón de la Fama
// (`GET /tournaments?status=finalized`: `ongoing: false` y `valid != false`,
// legacy incluidos) con campeón.
const isHallOfFameTournament = (tournament) =>
    tournament.ongoing === false &&
    tournament.valid !== false &&
    Boolean(tournament.outcome?.champion?.player)

// Ranking: más títulos primero y, a igual cantidad, más torneos con título o
// subcampeonato. A igual (títulos, títulos y subcampeonatos) comparten posición
// (1, 2, 2, 4).
const rankRows = (rows) => {
    const sorted = [...rows].sort(
        (a, b) =>
            b.titles - a.titles ||
            b.titlesAndRunnerUps - a.titlesAndRunnerUps ||
            String(a.player.name).localeCompare(String(b.player.name))
    )

    const ranked = []

    sorted.forEach((row, index) => {
        const previous = ranked[index - 1]
        const tied =
            previous &&
            previous.titles === row.titles &&
            previous.titlesAndRunnerUps === row.titlesAndRunnerUps

        ranked.push({ ...row, rank: tied ? previous.rank : index + 1 })
    })

    return ranked
}

const emptyCounters = () => ({
    titles: 0,
    runnerUps: 0,
    titlesAndRunnerUps: 0,
    finalsPlayed: 0,
    finalsWon: 0,
    finalsLost: 0,
})

const COUNTER_FIELDS = Object.keys(emptyCounters())

const hasFinal = (tournament) => tournament.format !== "league"

const addTournament = (counters, tournament, key) => {
    const isChampion = playerKey(tournament.outcome?.champion?.player) === key
    const finalist = tournament.outcome?.finalist?.player
    const isFinalist = Boolean(finalist) && playerKey(finalist) === key

    if (!isChampion && !isFinalist) return

    counters.titlesAndRunnerUps += 1

    if (isChampion) counters.titles += 1
    else counters.runnerUps += 1

    if (hasFinal(tournament)) {
        counters.finalsPlayed += 1

        if (isChampion) counters.finalsWon += 1
        else counters.finalsLost += 1
    }
}

const tally = (sequence, key) => {
    const counters = emptyCounters()

    for (const tournament of sequence) addTournament(counters, tournament, key)

    return counters
}

const pickCounters = (source) =>
    Object.fromEntries(COUNTER_FIELDS.map((field) => [field, source[field]]))

// Contadores de cada jugador de una secuencia de torneos ya ordenados. También
// incluye (con 0) a cada jugador inscripto en alguno de ellos.
const accumulate = (sequence, nameOf) => {
    const rows = new Map()
    const ensure = (player) => {
        const key = playerKey(player)

        if (!rows.has(key)) {
            rows.set(key, {
                player: { id: player.id ?? null, name: nameOf(player) },
                ...emptyCounters(),
            })
        }

        return rows.get(key)
    }

    for (const tournament of sequence) {
        for (const player of tournament.players ?? []) ensure(player)

        const champion = tournament.outcome?.champion?.player
        const finalist = tournament.outcome?.finalist?.player
        const involved = new Map()

        // Campeón y finalista pueden ser el mismo jugador: se cuenta una vez.
        for (const player of [champion, finalist]) {
            if (player) involved.set(playerKey(player), player)
        }

        for (const [key, player] of involved) {
            addTournament(ensure(player), tournament, key)
        }
    }

    return rankRows([...rows.values()])
}

const sortedHallOfFame = (tournaments) =>
    tournaments.filter(isHallOfFameTournament).sort(compareTournaments)

// Ranking de títulos de todos los torneos del Salón de la Fama, o solo hasta un
// torneo (inclusive) si se pasa `upToTournamentId`. Lo usa el contexto y el
// chequeo contra PROD.
const computeTitleRanking = (
    tournaments,
    { upToTournamentId = null, nameOf = identity } = {}
) => {
    const sequence = sortedHallOfFame(tournaments)
    const cut =
        upToTournamentId === null
            ? sequence
            : sequence.slice(
                  0,
                  sequence.findIndex(
                      ({ _id }) => String(_id) === String(upToTournamentId)
                  ) + 1
              )

    return accumulate(cut, nameOf)
}

const tournamentRef = (tournament, nameOf) => ({
    tournamentId: String(tournament._id),
    name: tournament.name,
    closedAt: tournament.closedAt
        ? new Date(tournament.closedAt).toISOString()
        : null,
    champion: {
        player: {
            id: tournament.outcome.champion.player.id ?? null,
            name: nameOf(tournament.outcome.champion.player),
        },
        team: tournament.outcome.champion.team
            ? {
                  id: tournament.outcome.champion.team.id ?? null,
                  name: tournament.outcome.champion.team.name ?? null,
              }
            : null,
    },
})

const participated = (tournament, key) =>
    (tournament.players ?? []).some((player) => playerKey(player) === key) ||
    playerKey(tournament.outcome?.champion?.player) === key ||
    playerKey(tournament.outcome?.finalist?.player) === key

// Títulos consecutivos de `key` terminando en el último torneo de `sequence`:
// solo cuentan los torneos en los que participó (si no jugó uno, no corta la
// racha; si jugó y no ganó, sí).
const consecutiveTitlesOf = (sequence, key) => {
    let count = 0

    for (let index = sequence.length - 1; index >= 0; index--) {
        const tournament = sequence[index]

        if (playerKey(tournament.outcome.champion.player) === key) count += 1
        else if (participated(tournament, key)) break
    }

    return count
}

// Torneo inmediatamente anterior de la racha de `key` (el último torneo previo
// en el que participó), solo si lo ganó; si no, `null`. Es el segundo de la
// cuenta de `consecutiveTitlesOf`, así que existe sii esa cuenta es >= 2.
const previousTitleOf = (before, key) => {
    for (let index = before.length - 1; index >= 0; index--) {
        const tournament = before[index]

        if (playerKey(tournament.outcome.champion.player) === key) {
            return tournament
        }
        if (participated(tournament, key)) return null
    }

    return null
}

const closedAtIso = (tournament) =>
    tournament.closedAt ? new Date(tournament.closedAt).toISOString() : null

// Contexto histórico del campeón de `tournament` a la fecha de su cierre: los
// títulos estrictamente anteriores más este. Pura.
//
// - `tournaments`: salida de `retrieveTournamentsForStatistics` (todos los
//   torneos; se filtran los del Salón de la Fama).
// - `tournament`: el torneo del recap (se agrega si no figura en la lista).
// - `nameOf`: nombre visible de un jugador ({ id, name }).
//
// Devuelve `{ titleContext, warnings }`.
const buildTitleContext = ({ tournaments, tournament, nameOf = identity }) => {
    const known = tournaments.some(
        ({ _id }) => String(_id) === String(tournament._id)
    )
    const pool = known ? tournaments : [...tournaments, tournament]
    const sequence = sortedHallOfFame(pool)
    const index = sequence.findIndex(
        ({ _id }) => String(_id) === String(tournament._id)
    )

    if (index === -1) {
        return { titleContext: null, warnings: [] }
    }

    const upTo = sequence.slice(0, index + 1)
    const before = sequence.slice(0, index)
    const current = sequence[index]
    const championKey = playerKey(current.outcome.champion.player)
    const finalistPlayer = current.outcome.finalist?.player ?? null
    const ranking = accumulate(upTo, nameOf)
    const rankingBefore = accumulate(before, nameOf)
    const rowOf = (rows, key) =>
        rows.find(({ player }) => playerKey(player) === key)
    const championRow = rowOf(ranking, championKey)
    const topTitles = ranking[0].titles
    const others = ranking.filter(
        ({ player }) => playerKey(player) !== championKey
    )
    const otherTop = Math.max(0, ...others.map(({ titles }) => titles))
    const championBefore = rowOf(rankingBefore, championKey)
    const leader = ranking.find(({ rank }) => rank === 1)
    const competition = getCompetition(current)
    const sameCompetition = upTo.filter(
        (item) => getCompetition(item).key === competition.key
    )
    const competitionBefore = sameCompetition.slice(0, -1)
    const championCompetitionTitles = sameCompetition.filter(
        (item) => playerKey(item.outcome.champion.player) === championKey
    )
    const lastEdition = competitionBefore[competitionBefore.length - 1]
    const wasDefendingChampion = Boolean(
        lastEdition &&
            playerKey(lastEdition.outcome.champion.player) === championKey
    )
    const previousTitleTournament = previousTitleOf(before, championKey)
    const aloneAtTop =
        championRow.titles === topTitles && championRow.titles > otherTop
    const wasAloneAtTop =
        championBefore &&
        championBefore.titles >
            Math.max(
                0,
                ...rankingBefore
                    .filter(({ player }) => playerKey(player) !== championKey)
                    .map(({ titles }) => titles)
            )
    let leadChange = null

    if (aloneAtTop && !wasAloneAtTop && otherTop > 0) leadChange = "new_leader"
    else if (
        !aloneAtTop &&
        championRow.titles === otherTop &&
        championRow.titles > 0 &&
        (championBefore?.titles ?? 0) < otherTop
    ) {
        leadChange = "tied_for_lead"
    }

    const warnings = []
    const withoutClosedAt = upTo.filter(({ closedAt }) => !closedAt)

    if (withoutClosedAt.length > 0) {
        warnings.push(
            `${withoutClosedAt.length} torneo(s) sin fecha de cierre: se ordenan primero al contar títulos`
        )
    }

    // La familia sale del formato: uno ausente o desconocido queda en una
    // familia aparte y puede dejar afuera títulos de la familia del campeón.
    const unknownFormat = upTo.filter((item) => !getCompetition(item).known)

    if (unknownFormat.length > 0) {
        warnings.push(
            `${
                unknownFormat.length
            } torneo(s) con formato ausente o desconocido (${[
                ...new Set(
                    unknownFormat.map(({ format }) => format ?? "sin formato")
                ),
            ].join(
                ", "
            )}): la cuenta de títulos por competencia puede estar incompleta`
        )
    }

    const finalistRow = finalistPlayer
        ? rowOf(ranking, playerKey(finalistPlayer))
        : null

    const recordsOf = (key) => ({
        beforeThisTournament: tally(before, key),
        sameCompetition: tally(sameCompetition, key),
    })

    return {
        titleContext: {
            asOf: current.closedAt
                ? new Date(current.closedAt).toISOString()
                : null,
            tournamentsConsidered: upTo.length,
            includesLegacy: true,
            countsIncludeThisTournament: true,
            countsScope: COUNTS_SCOPE,
            ranking: ranking.map((row) => ({
                player: row.player,
                ...pickCounters(row),
                rank: row.rank,
            })),
            champion: {
                player: championRow.player,
                titleNumber: championRow.titles,
                rank: championRow.rank,
                gapToLeader:
                    championRow.rank === 1 || !leader
                        ? null
                        : {
                              player: leader.player,
                              behind: leader.titles - championRow.titles,
                          },
                leadChange,
                isFirstTitle: championRow.titles === 1,
                consecutiveTitles: consecutiveTitlesOf(upTo, championKey),
                wasDefendingChampion,
                // Torneo (de cualquier formato) que el campeón ganó justo
                // antes de este, sin contar los que no jugó. Es el que se
                // cuenta en `consecutiveTitles`; `null` si no hay racha.
                previousTitle: previousTitleTournament
                    ? {
                          tournamentId: String(previousTitleTournament._id),
                          name: previousTitleTournament.name,
                          competitionLabel: getCompetition(
                              previousTitleTournament
                          ).label,
                          closedAt: closedAtIso(previousTitleTournament),
                      }
                    : null,
                // Edición anterior de la MISMA familia que el campeón ganó
                // (la última de `competition.previousWinners`); `null` si no
                // defiende el título.
                defendedEdition: wasDefendingChampion
                    ? {
                          tournamentId: String(lastEdition._id),
                          name: lastEdition.name,
                          closedAt: closedAtIso(lastEdition),
                      }
                    : null,
                titlesSameCompetition: {
                    key: competition.key,
                    label: competition.label,
                    count: championCompetitionTitles.length,
                    ordinal: championCompetitionTitles.length,
                },
                ...pickCounters(championRow),
                ...recordsOf(championKey),
            },
            runnerUp: finalistRow
                ? {
                      player: finalistRow.player,
                      // El finalista es también el campeón (dos equipos suyos
                      // o, en `league`, primero y segundo): ese torneo cuenta
                      // como título, no como subcampeonato.
                      isAlsoChampion: playerKey(finalistPlayer) === championKey,
                      rank: finalistRow.rank,
                      ...pickCounters(finalistRow),
                      ...recordsOf(playerKey(finalistPlayer)),
                  }
                : null,
            competition: {
                key: competition.key,
                label: competition.label,
                // Ediciones anteriores de la misma familia (mismo formato), de
                // la más vieja a la más nueva.
                previousWinners: competitionBefore.map((item) =>
                    tournamentRef(item, nameOf)
                ),
            },
        },
        warnings,
    }
}

module.exports = {
    buildTitleContext,
    computeTitleRanking,
    isHallOfFameTournament,
    playerKey,
    sortedHallOfFame,
}
