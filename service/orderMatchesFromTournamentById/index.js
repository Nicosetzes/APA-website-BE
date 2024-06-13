const { sortMatchesFromTournamentById } = require("./../../dao")

const orderMatchesFromTournamentById = async (tournamentId, group, valid) => {
    let matches = await sortMatchesFromTournamentById(
        tournamentId,
        group,
        valid
    )

    return valid
        ? matches.filter(({ valid }) => {
              return valid !== false
          })
        : matches
}

module.exports = orderMatchesFromTournamentById
