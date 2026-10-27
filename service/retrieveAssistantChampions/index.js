const { HALL_OF_FAME_VIEW_PATH } = require("../../config/assistant")
const {
    computeTitleRanking,
    playerKey,
    sortedHallOfFame,
} = require("../../controller/getTournamentRecapContext/titles")
const { findAllUsers, findTournamentsForStatistics } = require("./../../dao")
const { omitNil } = require("../../utils/omitNil")
const { formatPlayedOn } = require("../retrieveAssistantHeadToHead")
const CRITERION =
    "Cuentan los torneos terminados y válidos con campeón registrado, incluidos los históricos de 2016 a 2019 (no tienen partidos cargados). Título = campeón; subcampeonato = subcampeón (en una liga, el segundo de la tabla). Si campeón y subcampeón son la misma persona, el torneo cuenta como título y no como subcampeonato. Los torneos en curso y los inválidos no cuentan. titles y runnerUps ya están contados."
// Un torneo terminado y válido sin campeón no entra al Salón de la Fama.
const isFinishedWithoutChampion = (tournament) =>
    tournament.ongoing === false &&
    tournament.valid !== false &&
    !tournament.outcome?.champion?.player
const emptyToNull = (list) => (list.length > 0 ? list : null)
const toSide = (side, nameOf) =>
    side?.player
        ? omitNil({
              player: nameOf(side.player),
              team: side.team?.name ?? null,
          })
        : null
const toTournamentRow = (tournament, nameOf) => {
    const { champion, finalist } = tournament.outcome
    const sameChampionAndRunnerUp =
        Boolean(finalist?.player) &&
        playerKey(champion.player) === playerKey(finalist.player)
    return omitNil({
        name: tournament.name,
        closedOn: formatPlayedOn(
            tournament.closedAt,
            tournament.closedAtPrecision
        ),
        format: tournament.format ?? null,
        legacy: tournament.legacy === true ? true : null,
        champion: toSide(champion, nameOf),
        runnerUp: toSide(finalist, nameOf),
        sameChampionAndRunnerUp: sameChampionAndRunnerUp ? true : null,
    })
}
// Nombres de los torneos que ganó y de los que quedó segundo cada jugador, del
// más nuevo al más viejo y con la misma regla que `computeTitleRanking`: si
// campeón y finalista son la misma persona, es título y no subcampeonato.
const tournamentsByPlayer = (newestFirst) => {
    const titles = new Map()
    const runnerUps = new Map()
    const push = (map, key, name) => {
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(name)
    }
    for (const { name, outcome } of newestFirst) {
        const championKey = playerKey(outcome.champion.player)
        push(titles, championKey, name)
        const finalist = outcome.finalist?.player
        if (finalist && playerKey(finalist) !== championKey) {
            push(runnerUps, playerKey(finalist), name)
        }
    }
    return { titles, runnerUps }
}
// Arma la respuesta a partir de los torneos (`findTournamentsForStatistics`) y
// los usuarios. Pura: no lee la base.
const buildChampionsResponse = ({ tournaments, users, now }) => {
    const names = new Map(
        users
            .filter((user) => (user.id ?? user._id) && user.nickname)
            .map((user) => [String(user.id ?? user._id), user.nickname])
    )
    // Por id el nombre es el apodo actual; si el id no es un usuario, el nombre
    // que quedó guardado al cerrar el torneo.
    const nameOf = (player) => names.get(String(player?.id)) ?? player?.name
    const newestFirst = sortedHallOfFame(tournaments).reverse()
    const ranking = computeTitleRanking(tournaments, { nameOf })
    const byPlayer = tournamentsByPlayer(newestFirst)
    const rows = ranking.map((row) => {
        const key = playerKey(row.player)
        return {
            name: row.player.name,
            rank: row.rank,
            titles: row.titles,
            runnerUps: row.runnerUps,
            titleTournaments: byPlayer.titles.get(key) ?? [],
            runnerUpTournaments: byPlayer.runnerUps.get(key) ?? [],
        }
    })
    // Usuarios que nunca llegaron a una final: 0 y 0, al final. Comparten el
    // puesto de los de la cola de la tabla si esos tampoco ganaron nada.
    const listedIds = new Set(
        ranking.map(({ player }) => String(player.id ?? ""))
    )
    const last = rows[rows.length - 1]
    const noTitlesRank =
        last && last.titles === 0 && last.runnerUps === 0
            ? last.rank
            : rows.length + 1
    const withoutTitles = [...names]
        .filter(([id]) => !listedIds.has(id))
        .map(([, name]) => name)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
            name,
            rank: noTitlesRank,
            titles: 0,
            runnerUps: 0,
            titleTournaments: [],
            runnerUpTournaments: [],
        }))
    const withoutChampion = tournaments.filter(isFinishedWithoutChampion)
    const notes = []
    if (withoutChampion.length > 0) {
        notes.push(
            `${
                withoutChampion.length
            } torneo(s) terminado(s) no tienen campeón registrado y no cuentan: ${withoutChampion
                .map(({ name }) => name)
                .join(", ")}.`
        )
    }
    return {
        asOf: now.toISOString(),
        criterion: CRITERION,
        totalTournaments: newestFirst.length,
        tournaments: newestFirst.map((tournament) =>
            toTournamentRow(tournament, nameOf)
        ),
        players: [...rows, ...withoutTitles].map((row) =>
            omitNil({
                ...row,
                titleTournaments: emptyToNull(row.titleTournaments),
                runnerUpTournaments: emptyToNull(row.runnerUpTournaments),
            })
        ),
        viewPath: HALL_OF_FAME_VIEW_PATH,
        notes,
    }
}
const retrieveAssistantChampions = async (dependencies = {}) => {
    const findTournaments =
        dependencies.findTournamentsForStatistics ||
        findTournamentsForStatistics
    const findUsers = dependencies.findAllUsers || findAllUsers
    const now = dependencies.now?.() ?? new Date()
    const tournaments = Array.from((await findTournaments()) || [])
    const users = Array.from((await findUsers()) || [])
    return buildChampionsResponse({ tournaments, users, now })
}
module.exports = retrieveAssistantChampions
module.exports.CRITERION = CRITERION
module.exports.buildChampionsResponse = buildChampionsResponse
