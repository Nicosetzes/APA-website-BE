const { originateTournament } = require("./../../service")

const cloudinary = require("./../../cloudinary")

// console.log(cloudinary)

const postTournaments = async (req, res) => {
    const { name, format, players, teams, cloudinaryId } = req.body

    try {
        // Formatting tournament for DB BEGINS //

        let groups
        let teamsForDB
        let newTournament

        if (format == "world_cup" || format == "league_playin_playoff") {
            groups = Array.from(new Set(teams.map(({ group }) => group)))

            teamsForDB = teams.map(({ id, name, value, group }) => {
                let indexOfPlayer = players.findIndex(
                    (player) => player.id == value
                )

                return {
                    team: { id, name },
                    player: {
                        id: value,
                        name: players[indexOfPlayer].name,
                    },
                    group,
                }
            })

            newTournament = await originateTournament({
                name,
                players,
                teams: teamsForDB,
                format,
                groups,
                // cloudinary_id: cloudinaryId,
            })
        } else {
            teamsForDB = teams.map(({ id, name, value }) => {
                let indexOfPlayer = players.findIndex(
                    (player) => player.id == value
                )

                return {
                    team: { id, name },
                    player: {
                        id: value,
                        name: players[indexOfPlayer].name,
                    },
                }
            })

            newTournament = await originateTournament({
                name,
                players,
                teams: teamsForDB,
                format,
                // cloudinary_id: cloudinaryId,
            })
        }

        res.status(200).json(newTournament)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }

    // fs.unlinkSync(path) // I think it's not necessary in this case //

    //     res.status(200).json({
    //       message: 'images uploaded successfully',
    //       data: urls
    //     })

    //   } else {
    //     res.status(405).json({
    //       err: `${req.method} method not allowed`
    //     })
    //   }
}

module.exports = postTournaments
