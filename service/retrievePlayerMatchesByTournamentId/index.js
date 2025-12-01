const { findPlayerMatchesByTournamentId } = require("./../../dao")

const retrievePlayerMatchesByTournamentId = async (
    tournament,
    player,
    valid
) => {
    let matches = await findPlayerMatchesByTournamentId(
        tournament,
        player,
        valid
    )
    return valid
        ? matches.filter(({ valid }) => {
              return valid !== false
          })
        : matches
}

module.exports = retrievePlayerMatchesByTournamentId
