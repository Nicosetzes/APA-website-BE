// const { retrieveTournamentPlayersByTournamentId } = require("./../../service")

const {
    retrievePlayerMatchesByTournamentId,
    retrieveTournamentById,
    retrieveUserById,
} = require("../../service")

const getPlayerInfoByTournamentId = async (req, res) => {
    const { tournament, player } = req.params

    /* It's capturing the player ID, but on FE I'm hitting /:tournament/players?player={id}, NOT /:tournament/players/:player */
    /* Is /:player and ?player={id} THE SAME for req.params?  */

    try {
        const { teams } = await retrieveTournamentById(tournament)

        const playerFromDB = await retrieveUserById(player)

        const matchesFromDB = await retrievePlayerMatchesByTournamentId(
            tournament,
            player,
            true
        )

        const teamsFromDB = teams
            .filter((team) => team.player.id == player)
            .map(({ team }) => team)

        let totalMatches = matchesFromDB.filter(
            ({ playerP1, playerP2 }) =>
                playerP1.id == player || playerP2.id == player
        ).length

        let wins = matchesFromDB.filter(
            ({ outcome }) => outcome?.playerThatWon?.id == player
        ).length

        let losses = matchesFromDB.filter(
            ({ outcome }) => outcome?.playerThatLost?.id == player
        ).length

        let draws = totalMatches - wins - losses

        let goalsFor =
            matchesFromDB
                .filter(({ playerP1 }) => playerP1.id == player)
                .reduce((acc, curr) => {
                    return acc + curr.scoreP1
                }, 0) +
            matchesFromDB
                .filter(({ playerP2 }) => playerP2.id == player)
                .reduce((acc, curr) => {
                    return acc + curr.scoreP2
                }, 0)
        let goalsAgainst =
            matchesFromDB
                .filter(({ playerP1 }) => playerP1.id == player)
                .reduce((acc, curr) => {
                    return acc + curr.scoreP2
                }, 0) +
            matchesFromDB
                .filter(({ playerP2 }) => playerP2.id == player)
                .reduce((acc, curr) => {
                    return acc + curr.scoreP1
                }, 0)
        let scoringDifference = goalsFor - goalsAgainst

        const stats = {
            played: totalMatches,
            wins,
            draws,
            losses,
            goalsFor,
            goalsAgainst,
            scoringDifference,
            effectiveness: Number(
                (((wins * 3 + draws) / (totalMatches * 3)) * 100).toFixed(2)
            ),
        }

        res.status(200).json({
            player: { id: playerFromDB._id, name: playerFromDB.nickname },
            teams: teamsFromDB,
            matches: matchesFromDB,
            stats,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getPlayerInfoByTournamentId
