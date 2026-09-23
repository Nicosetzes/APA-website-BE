const {
    originateTournament,
    originatePlayoffByTournamentId,
} = require("./../../service")
const withTransaction = require("../../utils/withTransaction")

const GROUP_FORMATS = new Set([
    "champions_league",
    "league_playin_playoff",
    "super_cup",
    "world_cup",
    "world_cup_2026",
])

const createPostTournaments = (dependencies = {}) => {
    const createTournament =
        dependencies.originateTournament || originateTournament
    const createInitialPlayoff =
        dependencies.originatePlayoffByTournamentId ||
        originatePlayoffByTournamentId
    const runInTransaction = dependencies.withTransaction || withTransaction

    return async (req, res) => {
        const { cloudinary_id, format, name, players, teams } = req.body
        const tournament = {
            cloudinary_id: cloudinary_id ?? null,
            format,
            name,
            players,
            teams,
        }

        let newTournament

        if (GROUP_FORMATS.has(format)) {
            tournament.groups = Array.from(
                new Set(teams.map(({ group }) => group))
            )
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b)))

            newTournament = await createTournament(tournament)
        } else if (format === "playoff") {
            newTournament = await runInTransaction(async (session) => {
                const createdTournament = await createTournament(tournament, {
                    session,
                })

                await createInitialPlayoff(createdTournament, teams, {
                    session,
                })

                return createdTournament
            })
        } else {
            newTournament = await createTournament(tournament)
        }

        return res.status(200).json(newTournament)
    }
}

const postTournaments = createPostTournaments()

module.exports = postTournaments
module.exports.createPostTournaments = createPostTournaments
