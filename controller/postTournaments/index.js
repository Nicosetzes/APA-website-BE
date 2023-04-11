const { originateTournament, retrieveTournaments } = require("./../../service")

const cloudinary = require("./../../cloudinary")

// console.log(cloudinary)

const postTournaments = async (req, res) => {
    const { name, format } = req.body
    const players = JSON.parse(req.body.players)
    const teams = JSON.parse(req.body.teams)

    // TODO: Work the format //

    const apa_id = req.body.apa_id === "null" ? null : req.body.apa_id // El null llega como string en formData, por eso debo validar //

    try {
        // Formatting tournament for DB BEGINS //

        // const players = await retrieveAllUsers()

        const teamsForDB = teams.map(({ id, name, value }) => {
            let indexOfPlayer = players.findIndex(
                (player) => player.id == value
            )

            return {
                team: { id, name },
                player: {
                    id: value,
                    name: players[indexOfPlayer].nickname,
                },
            }
        })

        const tournamentsFromDB = await retrieveTournaments()

        const apaIdsFromTournaments = tournamentsFromDB
            .map(({ apa_id }) => Number(apa_id))
            .sort((a, b) => (a > b ? 1 : -1))

        // console.log(apaIdsFromTournaments)

        const urls = []
        const file = req.file
        const { path } = file

        let tournament

        if (apa_id === null) {
            const newApaId = Number(apaIdsFromTournaments.at(-1)) + 1

            // console.log(newApaId)

            tournament = await originateTournament({
                name,
                players,
                teams: teamsForDB,
                apa_id: newApaId,
            })

            // Uploading tournament image to Cloudinary BEGINS //
            const uploader = async (path) =>
                await cloudinary.uploads(path, "tournaments", newApaId)

            const newPath = await uploader(path) // Image upload to Cloudinary //
            urls.push(newPath)
        } else {
            // Uploading tournament image to Cloudinary BEGINS //
            const uploader = async (path) =>
                await cloudinary.uploads(path, "tournaments", apa_id)

            const newPath = await uploader(path) // Image upload to Cloudinary //
            urls.push(newPath)

            tournament = await originateTournament({
                name,
                players,
                teams: teamsForDB,
                apa_id,
            })
        }

        res.status(200).send({ tournament, urls })
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
