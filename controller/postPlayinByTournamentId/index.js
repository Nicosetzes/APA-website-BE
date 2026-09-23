const {
    orderMatchesFromTournamentById,
    originatePlayinByTournamentId,
    retrievePlayinMatchesByTournamentId,
    retrieveTournamentById,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const sameId = (left, right) => String(left) === String(right)
const hasReference = (value) =>
    value?.id !== undefined &&
    typeof value.name === "string" &&
    value.name.trim().length > 0

const calculateStandings = (teams, matches) => {
    if (
        teams.length < 10 ||
        teams.some(
            ({ team, player }) => !hasReference(team) || !hasReference(player)
        )
    ) {
        throw new HttpError(
            422,
            "PLAYIN_PARTICIPANTS_INVALID",
            "El grupo necesita al menos diez asignaciones válidas"
        )
    }

    if (
        matches.some(
            (match) =>
                !hasReference(match.teamP1) ||
                !hasReference(match.teamP2) ||
                !Number.isFinite(match.scoreP1) ||
                !Number.isFinite(match.scoreP2)
        )
    ) {
        throw new HttpError(
            422,
            "PLAYIN_DATA_INVALID",
            "Los resultados de la fase regular no son válidos"
        )
    }

    return teams
        .map(({ team, player }) => {
            const wins = matches.filter(({ outcome }) =>
                sameId(outcome?.teamThatWon?.id, team.id)
            ).length
            const draws = matches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (sameId(teamP1.id, team.id) ||
                        sameId(teamP2.id, team.id)) &&
                    outcome?.draw
            ).length
            const goalsFor = matches.reduce((total, match) => {
                if (sameId(match.teamP1.id, team.id)) {
                    return total + match.scoreP1
                }
                if (sameId(match.teamP2.id, team.id)) {
                    return total + match.scoreP2
                }
                return total
            }, 0)
            const goalsAgainst = matches.reduce((total, match) => {
                if (sameId(match.teamP1.id, team.id)) {
                    return total + match.scoreP2
                }
                if (sameId(match.teamP2.id, team.id)) {
                    return total + match.scoreP1
                }
                return total
            }, 0)

            return {
                team,
                player,
                goalsFor,
                goalsAgainst,
                scoringDifference: goalsFor - goalsAgainst,
                points: wins * 3 + draws,
            }
        })
        .sort(
            (left, right) =>
                right.points - left.points ||
                right.scoringDifference - left.scoringDifference ||
                right.goalsFor - left.goalsFor ||
                left.goalsAgainst - right.goalsAgainst
        )
}

const toMatchSide = ({ player, team }, seed) => ({
    player: { id: player.id, name: player.name },
    team: { id: team.id, name: team.name },
    seed,
})

const buildFirstRound = (standings, tournament, group) => {
    const first = toMatchSide(standings[6], "7")
    const second = toMatchSide(standings[7], "8")
    const third = toMatchSide(standings[8], "9")
    const fourth = toMatchSide(standings[9], "10")
    const firstId = group === "A" ? 1 : 3

    return [
        {
            playerP1: first.player,
            teamP1: first.team,
            seedP1: first.seed,
            playerP2: second.player,
            teamP2: second.team,
            seedP2: second.seed,
            type: "playin",
            tournament,
            played: false,
            playoff_id: firstId,
            group,
        },
        {
            playerP1: third.player,
            teamP1: third.team,
            seedP1: third.seed,
            playerP2: fourth.player,
            teamP2: fourth.team,
            seedP2: fourth.seed,
            type: "playin",
            tournament,
            played: false,
            playoff_id: firstId + 1,
            group,
        },
    ]
}

const createPostPlayinByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrievePlayinMatches =
        dependencies.retrievePlayinMatchesByTournamentId ||
        retrievePlayinMatchesByTournamentId
    const orderMatches =
        dependencies.orderMatchesFromTournamentById ||
        orderMatchesFromTournamentById
    const originatePlayin =
        dependencies.originatePlayinByTournamentId ||
        originatePlayinByTournamentId

    return async (req, res) => {
        const { group } = req.body
        const { tournament } = req.params
        const tournamentData = await retrieveTournament(tournament)

        if (!tournamentData) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo"
            )
        }
        if (
            tournamentData.format !== "league_playin_playoff" ||
            !tournamentData.groups?.includes(group)
        ) {
            throw new HttpError(
                422,
                "PLAYIN_UNSUPPORTED_TOURNAMENT",
                "El torneo o grupo no admite play-in"
            )
        }

        const existingMatches = await retrievePlayinMatches(tournament)
        if (existingMatches.some((match) => match.group === group)) {
            throw new HttpError(
                409,
                "PLAYIN_ALREADY_EXISTS",
                "El play-in de este grupo ya fue generado"
            )
        }

        const teams = tournamentData.teams.filter(
            (entry) => entry.group === group
        )
        const regularMatches = await orderMatches(tournament, group)
        const standings = calculateStandings(teams, regularMatches)
        const playinMatches = buildFirstRound(
            standings,
            { id: tournamentData.id, name: tournamentData.name },
            group
        )
        const playin = await originatePlayin(playinMatches)

        return res.status(200).json(playin)
    }
}

const postPlayinByTournamentId = createPostPlayinByTournamentId()

module.exports = postPlayinByTournamentId
module.exports.buildFirstRound = buildFirstRound
module.exports.calculateStandings = calculateStandings
module.exports.createPostPlayinByTournamentId = createPostPlayinByTournamentId
