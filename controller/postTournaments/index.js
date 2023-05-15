const { originateTournament } = require("./../../service")

const cloudinary = require("./../../cloudinary")

// console.log(cloudinary)

const postTournaments = async (req, res) => {
    const { name, format, players, teams, cloudinaryId } = req.body

    try {
        let groups
        let newTournament

        if (format == "world_cup" || format == "league_playin_playoff") {
            groups = Array.from(new Set(teams.map(({ group }) => group)))

            newTournament = await originateTournament({
                name,
                players,
                teams,
                format,
                groups,
                // cloudinary_id: cloudinaryId,
            })
        } else {
            newTournament = await originateTournament({
                name,
                players,
                teams,
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
