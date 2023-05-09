const { originateTournament } = require("./../../service")

const cloudinary = require("./../../cloudinary")

// console.log(cloudinary)

const postTournaments = async (req, res) => {
    const { name, format, players, teams, cloudinaryId } = req.body

    // const apa_id = req.body.apa_id == null ? null : req.body.apa_id // El null llega como string en formData, por eso debo validar //

    try {
        // Formatting tournament for DB BEGINS //

        // const playersFromDB = await retrieveAllUsers()

        const allGroups = teams.map(({ group }) => group)

        const groups = Array.from(new Set(allGroups))

        const teamsForDB = teams.map(({ id, name, value, group }) => {
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

        const tournament = await originateTournament({
            name,
            players,
            teams: teamsForDB,
            format,
            groups,
            // cloudinary_id: cloudinaryId,
        })

        res.status(200).json(tournament)
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
