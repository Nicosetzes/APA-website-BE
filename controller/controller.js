const {
    originateUser,
    retrieveUserById,
    retrieveUserByUserName,
    retrieveAllUsers,
    retrieveRecentMatchesFromPlayer,
    orderMatchesFromTournamentById,
    orderPlayoffMatchesFromTournamentById,
    originateMatch,
    originateManyMatches,
    modifyMatchResult,
    modifyMatchResultToRemoveIt,
    retrieveMatchesByTeamName,
    retrieveMatchesByTournamentIds,
    retrieveMatches,
    // retrieveTournamentTeamsByTournamentId,
    retrieveTournamentPlayersByTournamentId,
    retrieveTournaments,
    retrieveTournamentById,
    originateTournament,
} = require("./../service")

/* -------------------- HOME -------------------- */

const getHomeController = async (req, res) => {
    try {
        req.userId
            ? res.status(200).json({
                  user: {
                      id: req.userId,
                      name: req.userEmail,
                      nickname: req.userNickname,
                  },
              })
            : res
                  .status(200)
                  .json({ data: "El usuario aun no ha iniciado sesión" })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

/* -------------------- REGISTER -------------------- */

// const Joi = require("@hapi/joi");

// const schemaRegister = Joi.object({
//   email: Joi.string()
//     .min(6)
//     .messages({ "string.min": "El email debe tener al menos 6 caracteres" })
//     .max(255)
//     .required()
//     .email(),
//   password: Joi.string().min(8).max(1024).required().messages({
//     "string.min": "La contraseña debe tener al menos 8 caracteres",
//   }),
//   nickname: Joi.string().min(1).max(255).required(),
// });

const bcrypt = require("bcrypt")

const postRegisterController = async (req, res) => {
    try {
        // const { error } = schemaRegister.validate(req.body);

        // if (error) return res.status(400).json({ error: error.details[0].message });

        let { email, password, nickname } = req.body

        const doesUserExist = await retrieveUserByUserName(email)
        if (doesUserExist)
            return res.status(400).json({
                message: `Ya existe un usuario con el email ${doesUserExist.email}`,
            })

        const salt = await bcrypt.genSalt(10)
        const hiddenPassword = await bcrypt.hash(password, salt)

        const user = { email, password: hiddenPassword, nickname }

        const newUser = await originateUser(user)
        res.json({
            user: newUser,
            message: `Hola ${newUser.nickname}, se ha registrado con éxito`,
        })
    } catch (err) {
        return res.status(500).send({
            err,
            message: `Hubo un problema con el registro, intente más tarde`,
        })
    }
}

const jwt = require("jsonwebtoken")

const jwtKey = process.env.TOKEN_SECRET

const Joi = require("@hapi/joi")

const postLoginController = async (req, res) => {
    // Validation with custom messages //
    const schemaLogin = Joi.object({
        email: Joi.string().max(255).required().email().messages({
            "string.empty": `Ingrese un email`,
            "any.required": `El email es requerido`,
            "string.email": `Debe ingresar un email válido`,
        }),
        password: Joi.string().min(6).max(1024).required().messages({
            "string.min": `La contraseña debe tener un mínimo de {#limit} caracteres`,
            "string.empty": `Ingrese una contraseña`,
            "any.required": `La contraseña es requerida`,
        }),
    })

    try {
        const { error } = schemaLogin.validate(req.body)

        if (error)
            return res.status(400).json({
                auth: false,
                message: error.details[0].message,
            })

        let { email, password } = req.body

        const user = await retrieveUserByUserName(email)

        if (!user)
            return res.status(400).json({
                auth: false,
                message: "El usuario ingresado no existe",
            })

        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid)
            return res.status(400).json({
                auth: false,
                message: "La contraseña ingresada no es correcta",
            })

        const token = jwt.sign(
            {
                id: user._id,
            },
            jwtKey,
            {
                //   algorithm: "HS256",
                expiresIn: "4h",
            }
        )

        const userInfo = {
            email: user.email,
            nickname: user.nickname,
        }

        return res
            .cookie("jwt", token, {
                withCredentials: true,
                maxAge: 1000 * 60 * 60 * 4, // 4 horas //
                sameSite: "none",
                httpOnly: true,
                secure: process.env.NODE_ENV === "development" ? false : true,
            })
            .status(200)
            .json({
                auth: true,
                userInfo,
                message: `Bienvenid@ ${user.nickname}`,
            })
    } catch (err) {
        return res.status(500).json({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        })
    }
}

const postLogoutController = async (req, res) => {
    const token = req.cookies.jwt
    if (!token)
        return res
            .status(400)
            .json({ auth: false, message: "Primero debe iniciar sesión" }) // Revisar código de error //
    let decodedToken
    try {
        decodedToken = jwt.verify(token, process.env.TOKEN_SECRET)
    } catch (error) {
        res.status(400).json({
            auth: false,
            message: "Sesión no válida, error en las credenciales",
        })
    }
    const { id } = decodedToken
    try {
        const { nickname } = await retrieveUserById(id)
        return res
            .clearCookie("jwt", {
                withCredentials: true,
                sameSite: "none",
                httpOnly: true,
                secure: process.env.NODE_ENV === "development" ? false : true,
            })
            .status(200)
            .json({ auth: false, message: `Adiós ${nickname}` })
    } catch (err) {
        return res.status(500).json({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        }) // Revisar código de error //
    }
}

const getIsUserAuthenticatedController = async (req, res) => {
    const token = req.cookies.jwt

    if (!token) return res.status(200).json({ auth: false }) // Revisar código de error //
    let decodedToken
    try {
        decodedToken = jwt.verify(token, process.env.TOKEN_SECRET)
    } catch (error) {
        res.status(400).json({
            auth: false,
            message: "Sesión no válida, error en las credenciales",
        })
    }
    const { id } = decodedToken

    try {
        const user = await retrieveUserById(id)
        const newToken = jwt.sign(
            {
                id: user._id,
            },
            jwtKey,
            {
                //   algorithm: "HS256",
                expiresIn: "4h",
            }
        )
        const { email, nickname } = user // TODO: Add user roles
        const userInfo = {
            email,
            nickname,
        }
        return res
            .cookie("jwt", newToken, {
                withCredentials: true,
                maxAge: 1000 * 60 * 60 * 4, // 4 horas //
                sameSite: "none",
                httpOnly: true,
                secure: process.env.NODE_ENV === "development" ? false : true,
            })
            .status(200)
            .json({
                auth: true,
                user: userInfo,
                message: `Hola ${nickname}, bienvenid@`,
            })
    } catch (err) {
        return res.status(500).json({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        }) // Revisar código de error //
    }
}

const getTournamentsController = async (req, res) => {
    const { active, inactive } = req.query

    try {
        let activeTournaments
        let inactiveTournaments

        if (active)
            activeTournaments = await retrieveTournaments({
                ongoing: true,
            })
        if (inactive)
            inactiveTournaments = await retrieveTournaments({
                ongoing: false,
            })

        res.status(200).json({ activeTournaments, inactiveTournaments })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const cloudinary = require("./../cloudinary")

// console.log(cloudinary)

const postTournamentsController = async (req, res) => {
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

const getTournamentByIdController = async (req, res) => {
    const tournamentId = req.params.tournament
    try {
        const tournament = await retrieveTournamentById(tournamentId)
        res.status(200).json(tournament)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

// const getFixtureByTournamentIdController = async (req, res) => {
//     // IMPORTANT: Have to remake once this tournament is finished //
//     const tournamentId = req.params.tournament
//     try {
//         const activeTournament = await retrieveTournamentById(tournamentId)
//         res.status(200).json(activeTournament)
//         // Agregar excepción en caso de error
//     } catch (err) {
//         return res.status(500).send("Something went wrong!" + err)
//     }
// }

const getFixtureByTournamentIdController = async (req, res) => {
    const { tournament } = req.params
    try {
        // AHORA DEBO TRAER LOS PARTIDOS DE UN TORNEO ESPECÍFICO //
        const matches = await retrieveMatchesByTournamentIds([tournament])
        res.status(200).json(matches)
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getPlayersFromTournamentController = async (req, res) => {
    const tournamentId = req.params.tournament
    try {
        const players = await retrieveTournamentPlayersByTournamentId(
            tournamentId
        )
        res.status(200).json(players)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const { fixture } = require("./../fixture-generation")

// const postFixtureController = async (req, res) => {
//     try {
//         const { players, teams } = req.body
//         const { tournament } = req.params
//         const assignmentArray = []

//         const tournamentFromDB = await retrieveTournamentById(tournament)

//         const teamsFromTournament = tournamentFromDB.teams

//         teams.forEach((teamFromUser, index) => {
//             let { team } = teamsFromTournament.filter(
//                 (teamFromTournament) =>
//                     teamFromTournament.team.id == teamFromUser.id
//             )[0] // Me quedo el único elemento de la lista

//             let assignment = {
//                 team,
//                 player: players[index],
//             }

//             assignmentArray.push(assignment)
//         })

//         // Actualizo "teams" dentro del torneo, para sumar la info de qué jugadores juegan con qué equipos. Es necesario para los standings //

//         // console.log(assignmentArray)

//         const updatedTournament = await modifyTeamsFromTournament(
//             tournament,
//             assignmentArray
//         )

//         const playersForFixtureGeneration = updatedTournament.players // REVISAR

//         const tournamentForFixtureGeneration = {
//             name: updatedTournament.name,
//             id: updatedTournament.id,
//         }

//         const definitiveFixture = fixture(
//             assignmentArray,
//             playersForFixtureGeneration,
//             tournamentForFixtureGeneration
//             // REVISAR
//         ) // GENERO EL FIXTURE

//         if (!definitiveFixture.error) {
//             const newFixture = await originateManyMatches(definitiveFixture)

//             res.status(200).send(newFixture)
//         }
//     } catch (err) {
//         res.status(500).send("Something went wrong" + err)
//     }
// }

const getOriginateGameController = async (req, res) => {
    const tournamentId = req.params.id
    try {
        let { _id, name, teams, players } = await retrieveTournamentById(
            tournamentId
        )
        res.status(200).send({ tournament: { id: _id, name }, teams, players })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const postOriginateGameController = async (req, res) => {
    const tournamentId = req.params.id

    try {
        const tournament = await retrieveTournamentById(tournamentId)

        let {
            playerP1,
            teamP1,
            scoreP1,
            playerP2,
            teamP2,
            scoreP2,
            penaltyScoreP1,
            penaltyScoreP2,
            type,
        } = req.body

        let outcome

        if (scoreP1 - scoreP2 !== 0) {
            scoreP1 > scoreP2
                ? (outcome = {
                      playerThatWon: playerP1,
                      teamThatWon: teamP1,
                      scoreFromTeamThatWon: scoreP1,
                      playerThatLost: playerP2,
                      teamThatLost: teamP2,
                      scoreFromTeamThatLost: scoreP2,
                      draw: false,
                      scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                  })
                : (outcome = {
                      playerThatWon: playerP2,
                      teamThatWon: teamP2,
                      scoreFromTeamThatWon: scoreP2,
                      playerThatLost: playerP1,
                      teamThatLost: teamP1,
                      scoreFromTeamThatLost: scoreP1,
                      draw: false,
                      scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                  })
        } else if (
            scoreP1 - scoreP2 === 0 &&
            penaltyScoreP1 &&
            penaltyScoreP2
        ) {
            // Empate, y hubo penales
            penaltyScoreP1 > penaltyScoreP2
                ? (outcome = {
                      playerThatWon: playerP1,
                      teamThatWon: teamP1,
                      scoreFromTeamThatWon: penaltyScoreP1,
                      playerThatLost: playerP2,
                      teamThatLost: teamP2,
                      scoreFromTeamThatLost: penaltyScoreP2,
                      draw: true,
                      penalties: true,
                      scoringDifference: 0,
                  })
                : (outcome = {
                      playerThatWon: playerP2,
                      teamThatWon: teamP2,
                      scoreFromTeamThatWon: penaltyScoreP2,
                      playerThatLost: playerP1,
                      teamThatLost: teamP1,
                      scoreFromTeamThatLost: penaltyScoreP1,
                      draw: true,
                      penalties: true,
                      scoringDifference: 0,
                  })
        } else {
            // Empate, pero no hubo penales!
            outcome = {
                draw: true,
                penalties: false,
            }
        }

        const match = {
            playerP1,
            teamP1,
            scoreP1,
            playerP2,
            teamP2,
            scoreP2,
            outcome,
            type,
            tournament: {
                name: tournament.name,
                id: tournament.id,
            },
        }

        const createdMatch = await originateMatch(match)

        createdMatch && res.status(200).send(createdMatch)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const putModifyGameController = async (req, res) => {
    //TODO: Accomodate matches inside each tournament, maybe?
    const matchId = req.params.match
    try {
        // const tournament = await retrieveTournamentById(tournamentId)

        let {
            playerP1,
            playerP2,
            teamP1,
            teamP2,
            scoreP1,
            scoreP2,
            penaltyScoreP1,
            penaltyScoreP2,
        } = req.body

        let outcome

        if (scoreP1 - scoreP2 !== 0) {
            scoreP1 > scoreP2
                ? (outcome = {
                      playerThatWon: playerP1,
                      teamThatWon: teamP1,
                      scoreFromTeamThatWon: scoreP1,
                      playerThatLost: playerP2,
                      teamThatLost: teamP2,
                      scoreFromTeamThatLost: scoreP2,
                      draw: false,
                      scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                  })
                : (outcome = {
                      playerThatWon: playerP2,
                      teamThatWon: teamP2,
                      scoreFromTeamThatWon: scoreP2,
                      playerThatLost: playerP1,
                      teamThatLost: teamP1,
                      scoreFromTeamThatLost: scoreP1,
                      draw: false,
                      scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                  })
        } else if (
            scoreP1 - scoreP2 === 0 &&
            penaltyScoreP1 &&
            penaltyScoreP2
        ) {
            // Empate, y hubo penales
            penaltyScoreP1 > penaltyScoreP2
                ? (outcome = {
                      playerThatWon: playerP1,
                      teamThatWon: teamP1,
                      scoreFromTeamThatWon: penaltyScoreP1,
                      playerThatLost: playerP2,
                      teamThatLost: teamP2,
                      scoreFromTeamThatLost: penaltyScoreP2,
                      draw: true,
                      penalties: true,
                      scoringDifference: 0,
                  })
                : (outcome = {
                      playerThatWon: playerP2,
                      teamThatWon: teamP2,
                      scoreFromTeamThatWon: penaltyScoreP2,
                      playerThatLost: playerP1,
                      teamThatLost: teamP1,
                      scoreFromTeamThatLost: penaltyScoreP1,
                      draw: true,
                      penalties: true,
                      scoringDifference: 0,
                  })
        } else {
            // Empate, pero no hubo penales!
            outcome = {
                draw: true,
                penalties: false,
            }
        }

        const uploadedMatch = await modifyMatchResult(
            matchId,
            scoreP1,
            scoreP2,
            outcome
        )

        uploadedMatch
            ? res.status(200).send(uploadedMatch)
            : res.status(500).send({ error: "Match wasn't found in the DB" })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const putRemoveGameController = async (req, res) => {
    // const tournamentId = req.params.id
    const matchId = req.params.match

    try {
        const deletedResult = await modifyMatchResultToRemoveIt(matchId) // I make an update on the result in "face-to-face" collection

        deletedResult
            ? res.status(200).json(deletedResult)
            : res.status(500).json({
                  err: "Match couldn't be deleted because it wasn't found",
              })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getStandingsFromTournamentController = async (req, res) => {
    const { tournament } = req.params

    try {
        const tournamentFromDB = await retrieveTournamentById(tournament)
        const matches = await orderMatchesFromTournamentById(tournament)
        const teamsFromTournament = tournamentFromDB.teams
        const standings = []

        teamsFromTournament.forEach(async ({ team, player }) => {
            let played = matches.filter(
                ({ teamP1, teamP2 }) =>
                    teamP1.id == team.id || teamP2.id == team.id
            ).length
            let wins = matches.filter(
                ({ outcome }) => outcome?.teamThatWon?.id == team.id
            ).length
            let draws = matches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length
            let losses = matches.filter(
                ({ outcome }) => outcome?.teamThatLost?.id == team.id
            ).length
            let goalsFor =
                matches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                matches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                matches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                matches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws
            let streak = matches
                .filter(
                    ({ teamP1, teamP2 }) =>
                        teamP1.id === team.id || teamP2.id === team.id
                )
                .splice(0, 5) // REVISAR //
                .map(
                    ({
                        outcome,
                        id,
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        updatedAt,
                    }) => {
                        const {
                            playerThatWon,
                            teamThatWon,
                            scoreFromTeamThatWon,
                            playerThatLost,
                            teamThatLost,
                            scoreFromTeamThatLost,
                        } = outcome
                        if (teamThatWon && teamThatWon.id === team.id)
                            return {
                                outcome: "w",
                                playerP1: playerThatWon,
                                teamP1: teamThatWon,
                                scoreP1: scoreFromTeamThatWon,
                                playerP2: playerThatLost,
                                teamP2: teamThatLost,
                                scoreP2: scoreFromTeamThatLost,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (teamThatLost && teamThatLost.id === team.id)
                            return {
                                outcome: "l",
                                playerP1: playerThatLost,
                                teamP1: teamThatLost,
                                scoreP1: scoreFromTeamThatLost,
                                playerP2: playerThatWon,
                                teamP2: teamThatWon,
                                scoreP2: scoreFromTeamThatWon,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (outcome.draw)
                            return {
                                outcome: "d",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                    }
                )
                .reverse()

            standings.push({
                team,
                player,
                played,
                wins,
                draws,
                losses,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
                streak,
            })
        })

        let sortedStandings = standings.sort(function (a, b) {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        res.status(200).send({
            name: tournamentFromDB.name,
            sortedStandings,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getStandingsPlayerInfoFromTournamentController = async (req, res) => {
    const { tournament } = req.params

    try {
        const tournamentFromDB = await retrieveTournamentById(tournament)
        const matches = await orderMatchesFromTournamentById(tournament)

        const { players, _id } = tournamentFromDB
        const tournamentName = tournamentFromDB.name

        const playerStats = []

        players.forEach((player) => {
            let played = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id == player.id || playerP2.id == player.id
            ).length

            let wins = matches.filter(
                (match) => match.outcome?.playerThatWon?.id === player.id
            ).length

            let losses = matches.filter(
                (match) => match.outcome?.playerThatLost?.id === player.id
            ).length

            let draws = played - wins - losses

            let points = wins * 3 + draws

            let streak = matches
                .filter(
                    ({ playerP1, playerP2 }) =>
                        playerP1.id == player.id || playerP2.id == player.id
                )
                .splice(0, 10) // REVISAR //
                .map(
                    ({
                        outcome,
                        id,
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        updatedAt,
                    }) => {
                        const { playerThatWon } = outcome
                        const { playerThatLost } = outcome
                        const { teamThatWon } = outcome
                        const { scoreFromTeamThatWon } = outcome
                        const { teamThatLost } = outcome
                        const { scoreFromTeamThatLost } = outcome
                        if (playerThatWon && playerThatWon.id == player.id)
                            return {
                                outcome: "w",
                                playerP1: playerThatWon,
                                teamP1: teamThatWon,
                                scoreP1: scoreFromTeamThatWon,
                                playerP2: playerThatLost,
                                teamP2: teamThatLost,
                                scoreP2: scoreFromTeamThatLost,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (playerThatLost && playerThatLost.id == player.id)
                            return {
                                outcome: "l",
                                playerP1: playerThatLost,
                                teamP1: teamThatLost,
                                scoreP1: scoreFromTeamThatLost,
                                playerP2: playerThatWon,
                                teamP2: teamThatWon,
                                scoreP2: scoreFromTeamThatWon,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (outcome.draw)
                            return {
                                outcome: "d",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                    }
                )
                .reverse()

            playerStats.push({
                player: { name: player.name, id: player.id },
                tournament: { name: tournamentName, id: _id },
                played,
                wins,
                draws,
                losses,
                points,
                streak,
            })
        })
        res.send(playerStats)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getPlayoffsTableController = async (req, res) => {
    const { tournament } = req.params

    try {
        const playoffs = await retrieveTournamentById(tournament)

        const { parents, teams } = playoffs

        let tournamentData = parents.map(async ({ id }) => {
            return await retrieveTournamentById(id)
        })

        Promise.all(tournamentData)
            .then((values) => {
                return values
            })
            .then((tournaments) => {
                const allTeams = []

                let counter = 0

                tournaments.forEach(async (tournament) => {
                    let matches = await orderMatchesFromTournamentById(
                        tournament.id
                    )

                    teams.forEach(({ team, player }) => {
                        let played = matches.filter(
                            ({ teamP1, teamP2 }) =>
                                teamP1.id == team.id || teamP2.id == team.id
                        ).length
                        let wins = matches.filter(
                            ({ outcome }) => outcome?.teamThatWon?.id == team.id
                        ).length
                        let draws = matches.filter(
                            ({ teamP1, teamP2, outcome }) =>
                                (teamP1.id == team.id ||
                                    teamP2.id == team.id) &&
                                outcome.draw
                        ).length
                        let losses = matches.filter(
                            ({ outcome }) =>
                                outcome?.teamThatLost?.id == team.id
                        ).length
                        let goalsFor =
                            matches
                                .filter(({ teamP1 }) => teamP1.id == team.id)
                                .reduce((acc, curr) => {
                                    return acc + curr.scoreP1
                                }, 0) +
                            matches
                                .filter(({ teamP2 }) => teamP2.id == team.id)
                                .reduce((acc, curr) => {
                                    return acc + curr.scoreP2
                                }, 0)
                        let goalsAgainst =
                            matches
                                .filter(({ teamP1 }) => teamP1.id == team.id)
                                .reduce((acc, curr) => {
                                    return acc + curr.scoreP2
                                }, 0) +
                            matches
                                .filter(({ teamP2 }) => teamP2.id == team.id)
                                .reduce((acc, curr) => {
                                    return acc + curr.scoreP1
                                }, 0)
                        let scoringDifference = goalsFor - goalsAgainst
                        let points = wins * 3 + draws

                        allTeams.push({
                            team,
                            player,
                            played,
                            wins,
                            draws,
                            losses,
                            goalsFor,
                            goalsAgainst,
                            scoringDifference,
                            points,
                        })
                    })

                    counter++

                    if (counter === tournaments.length) {
                        let sortedPlayoffsTeams = allTeams.sort(function (
                            a,
                            b
                        ) {
                            if (a.points > b.points) return -1
                            if (a.points < b.points) return 1

                            if (a.scoringDifference > b.scoringDifference)
                                return -1
                            if (a.scoringDifference < b.scoringDifference)
                                return 1

                            if (a.goalsFor > b.goalsFor) return -1
                            if (a.goalsFor < b.goalsFor) return 1

                            if (a.goalsAgainst > b.goalsAgainst) return 1
                            if (a.goalsAgainst < b.goalsAgainst) return -1
                        })

                        const definitiveSortedPlayoffsTeams =
                            sortedPlayoffsTeams.filter((match) => match.played)
                        res.status(200).json(definitiveSortedPlayoffsTeams)
                    }
                })
            })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getPlayoffsPlayerInfoController = async (req, res) => {
    const { tournament } = req.params

    try {
        const playoffs = await retrieveTournamentById(tournament)

        const { parents, players } = playoffs

        const idsFromParents = parents.map(({ id }) => id)

        const matches = await retrieveMatchesByTournamentIds([tournament])

        const playoffsPlayerStats = []

        players.forEach(({ id, name }) => {
            let played = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id == id || playerP2.id == id
            ).length

            let wins = matches.filter(
                ({ outcome }) => outcome?.playerThatWon?.id == id
            ).length

            let losses = matches.filter(
                ({ outcome }) => outcome?.playerThatLost?.id == id
            ).length

            let draws = played - wins - losses

            let points = wins * 3 + draws

            playoffsPlayerStats.push({
                player: { name, id },
                played,
                wins,
                draws,
                losses,
                points,
            })
            if (playoffsPlayerStats.length == players.length)
                res.send(playoffsPlayerStats)
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getPlayoffsBracketController = async (req, res) => {
    const { tournament } = req.params

    try {
        const playoffs = await retrieveTournamentById(tournament)

        const teamsSortedBySeed = playoffs.teams
            .map(({ team, player, seed }) => {
                return {
                    team,
                    player,
                    seed,
                    tournament: { name: playoffs.name, id: playoffs.id },
                }
            })
            .sort((a, b) => (a.seed > b.seed ? 1 : -1))

        res.status(200).send(teamsSortedBySeed)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getPlayoffsUpdatedWinsController = async (req, res) => {
    const { tournament } = req.params

    try {
        const playoffs = await retrieveTournamentById(tournament)

        const { teams } = playoffs

        const matches = await retrieveMatchesByTournamentIds([tournament])

        const winsByTeam = []

        if (matches.length) {
            teams.forEach(({ team, player, seed }) => {
                const matchesFromTeam = matches.filter(
                    ({ teamP1, teamP2 }) =>
                        teamP1.id == team.id || teamP2.id == team.id
                )
                if (matchesFromTeam.length) {
                    const wins = matchesFromTeam.filter(
                        ({ outcome }) => outcome.teamThatWon?.id == team.id
                    ).length
                    winsByTeam.push({
                        team,
                        player,
                        seed,
                        tournament: {
                            name: tournament.name,
                            id: tournament.id,
                        },
                        wins,
                    })
                } else {
                    winsByTeam.push({
                        team,
                        player,
                        seed,
                        tournament: {
                            name: tournament.name,
                            id: tournament.id,
                        },
                        wins: 0,
                    })
                }
            })
        }
        res.status(200).send({ winsByTeam, playoffsMatches: matches })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getUsersController = async (req, res) => {
    // const { query } = req.query
    try {
        const allPlayers = await retrieveAllUsers()
        const players = allPlayers.map(({ _id, nickname }) => {
            return {
                id: _id,
                name: nickname,
            }
        })
        res.json(players)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getMatchesController = async (req, res) => {
    const { query } = req.query
    try {
        if (query) {
            const matches = await retrieveMatchesByTeamName(query)
            res.json(matches)
        } else {
            const matches = await retrieveMatches(10)
            res.json(matches)
        }
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const postMatchesController = async (req, res) => {
    const {
        playerP1,
        teamP1,
        scoreP1,
        playerP2,
        teamP2,
        scoreP2,
        penaltyScoreP1,
        penaltyScoreP2,
        type,
        tournament,
    } = req.body

    try {
        let outcome

        if (scoreP1 - scoreP2 !== 0) {
            scoreP1 > scoreP2
                ? (outcome = {
                      playerThatWon: playerP1,
                      teamThatWon: teamP1,
                      scoreFromTeamThatWon: scoreP1,
                      playerThatLost: playerP2,
                      teamThatLost: teamP2,
                      scoreFromTeamThatLost: scoreP2,
                      draw: false,
                      scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                  })
                : (outcome = {
                      playerThatWon: playerP2,
                      teamThatWon: teamP2,
                      scoreFromTeamThatWon: scoreP2,
                      playerThatLost: playerP1,
                      teamThatLost: teamP1,
                      scoreFromTeamThatLost: scoreP1,
                      draw: false,
                      scoringDifference: Math.abs(scoreP1 - scoreP2), // Es indistinto el orden, pues calculo valor absoluto.
                  })
        } else if (
            scoreP1 - scoreP2 === 0 &&
            penaltyScoreP1 &&
            penaltyScoreP2
        ) {
            // Empate, y hubo penales
            penaltyScoreP1 > penaltyScoreP2
                ? (outcome = {
                      playerThatWon: playerP1,
                      teamThatWon: teamP1,
                      scoreFromTeamThatWon: penaltyScoreP1,
                      playerThatLost: playerP2,
                      teamThatLost: teamP2,
                      scoreFromTeamThatLost: penaltyScoreP2,
                      draw: true,
                      penalties: true,
                      scoringDifference: 0,
                  })
                : (outcome = {
                      playerThatWon: playerP2,
                      teamThatWon: teamP2,
                      scoreFromTeamThatWon: penaltyScoreP2,
                      playerThatLost: playerP1,
                      teamThatLost: teamP1,
                      scoreFromTeamThatLost: penaltyScoreP1,
                      draw: true,
                      penalties: true,
                      scoringDifference: 0,
                  })
        } else {
            // Empate, pero no hubo penales!
            outcome = {
                draw: true,
                penalties: false,
            }
        }

        const match = {
            playerP1,
            teamP1,
            scoreP1,
            playerP2,
            teamP2,
            scoreP2,
            outcome,
            type,
            tournament,
            played: true,
        }

        const createdMatch = await originateMatch(match)

        createdMatch && res.status(200).send(createdMatch)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

// const putWorldCupTeamAssignmentController = async (req, res) => {
//     const { tournament } = req.params
//     const assignments = req.body
//     try {
//         const playersFromTournament =
//             await retrieveTournamentPlayersByTournamentId(tournament)
//         const teamsFromTournament = await retrieveTournamentTeamsByTournamentId(
//             tournament
//         )
//         let playerName
//         let teamName
//         const teamsWithAssignedPlayers = assignments.map(({ team, user }) => {
//             const filteredPlayerArray = playersFromTournament.filter(
//                 ({ id }) => id == user.id
//             )
//             filteredPlayerArray.length
//                 ? (playerName = filteredPlayerArray[0].name)
//                 : (playerName = "IA")
//             const filteredTeamsArray = teamsFromTournament.filter(
//                 (teamFromDB) => teamFromDB.team.id == team.id
//             )
//             if (filteredTeamsArray.length)
//                 teamName = filteredTeamsArray[0].team.name

//             return {
//                 team: { name: teamName, id: team.id, group: team.group },
//                 player: { name: playerName, id: user.id },
//             }
//         })
//         // console.log(teamsWithAssignedPlayers)
//         const teamsWithAssignedPlayersFromDB =
//             await modifyTeamUsersFromTournamentByTournamentId(
//                 tournament,
//                 teamsWithAssignedPlayers
//             )
//         // console.log(teamsWithAssignedPlayersFromDB)
//         res.status(200).send(teamsWithAssignedPlayersFromDB)
//     } catch (err) {
//         return res.status(500).send("Something went wrong!" + err)
//     }
// }

const getWorldCupStandingsController = async (req, res) => {
    const { tournament } = req.params
    try {
        const tournamentFromDB = await retrieveTournamentById(tournament)
        const matches = await orderMatchesFromTournamentById(tournament)
        const teamsFromTournament = tournamentFromDB.teams
        const standings = []

        teamsFromTournament.forEach(async ({ team, player }) => {
            let played = matches.filter(
                ({ teamP1, teamP2 }) =>
                    teamP1.id == team.id || teamP2.id == team.id
            ).length
            let wins = matches.filter(
                ({ outcome }) => outcome?.teamThatWon?.id == team.id
            ).length
            let draws = matches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length
            let losses = matches.filter(
                ({ outcome }) => outcome?.teamThatLost?.id == team.id
            ).length
            let goalsFor =
                matches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                matches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                matches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                matches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws

            standings.push({
                team,
                player, // REVISAR
                played,
                wins,
                draws,
                losses,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
            })
        })
        const sortedStandings = standings.sort(function (a, b) {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        res.status(200).send(sortedStandings)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getWorldCupPlayoffTeamsController = async (req, res) => {
    const { tournament } = req.params
    try {
        const tournamentFromDB = await retrieveTournamentById(tournament)
        const regularMatches = await orderMatchesFromTournamentById(tournament)
        const playoffMatches = await orderPlayoffMatchesFromTournamentById(
            tournament
        )
        const teamsFromTournament = tournamentFromDB.teams
        const standings = []

        teamsFromTournament.forEach(async ({ team, player }) => {
            let winsInGroups = regularMatches.filter((match) => {
                let { outcome } = match
                return outcome?.teamThatWon?.id == team.id
            }).length

            let winsInPlayoffs = 0

            if (playoffMatches.length) {
                winsInPlayoffs = playoffMatches.filter((match) => {
                    let { outcome } = match
                    // console.log(type)
                    return outcome?.teamThatWon?.id == team.id
                }).length
            }

            let draws = regularMatches.filter(
                ({ teamP1, teamP2, outcome }) =>
                    (teamP1.id == team.id || teamP2.id == team.id) &&
                    outcome?.draw
            ).length

            let goalsFor =
                regularMatches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                regularMatches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)

            let goalsAgainst =
                regularMatches
                    .filter(({ teamP1 }) => teamP1.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                regularMatches
                    .filter(({ teamP2 }) => teamP2.id == team.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)

            let scoringDifference = goalsFor - goalsAgainst

            let points = winsInGroups * 3 + draws

            let streak = regularMatches
                .filter(
                    ({ teamP1, teamP2 }) =>
                        teamP1.id === team.id || teamP2.id === team.id
                )
                .splice(0, 5) // REVISAR //
                .map(
                    ({
                        outcome,
                        id,
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        updatedAt,
                    }) => {
                        const {
                            playerThatWon,
                            teamThatWon,
                            scoreFromTeamThatWon,
                            playerThatLost,
                            teamThatLost,
                            scoreFromTeamThatLost,
                        } = outcome
                        if (teamThatWon && teamThatWon.id === team.id)
                            return {
                                outcome: "w",
                                playerP1: playerThatWon,
                                teamP1: teamThatWon,
                                scoreP1: scoreFromTeamThatWon,
                                playerP2: playerThatLost,
                                teamP2: teamThatLost,
                                scoreP2: scoreFromTeamThatLost,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (teamThatLost && teamThatLost.id === team.id)
                            return {
                                outcome: "l",
                                playerP1: playerThatLost,
                                teamP1: teamThatLost,
                                scoreP1: scoreFromTeamThatLost,
                                playerP2: playerThatWon,
                                teamP2: teamThatWon,
                                scoreP2: scoreFromTeamThatWon,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                        if (outcome.draw)
                            return {
                                outcome: "d",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                            }
                    }
                )
                .reverse()

            standings.push({
                team,
                player,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
                winsInPlayoffs,
                streak,
                tournament: {
                    name: tournamentFromDB.name,
                    id: tournamentFromDB.id,
                },
            })
        })
        const sortedStandings = standings.sort((a, b) => {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        const playoffSortedStandingsByGroup = [
            sortedStandings
                .filter(({ team }) => team.group == "A")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "B")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "C")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "D")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "E")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "F")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "G")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
            sortedStandings
                .filter(({ team }) => team.group == "H")
                .map(
                    (
                        { player, team, winsInPlayoffs, streak, tournament },
                        index
                    ) => {
                        return {
                            index,
                            player,
                            team,
                            winsInPlayoffs,
                            streak,
                            tournament,
                        }
                    }
                ),
        ]

        const firstQuadrant = [
            playoffSortedStandingsByGroup[0].at(0),
            playoffSortedStandingsByGroup[1].at(1),
            playoffSortedStandingsByGroup[2].at(0),
            playoffSortedStandingsByGroup[3].at(1),
        ]

        const secondQuadrant = [
            playoffSortedStandingsByGroup[4].at(0),
            playoffSortedStandingsByGroup[5].at(1),
            playoffSortedStandingsByGroup[6].at(0),
            playoffSortedStandingsByGroup[7].at(1),
        ]

        const thirdQuadrant = [
            playoffSortedStandingsByGroup[1].at(0),
            playoffSortedStandingsByGroup[0].at(1),
            playoffSortedStandingsByGroup[3].at(0),
            playoffSortedStandingsByGroup[2].at(1),
        ]

        const fourthQuadrant = [
            playoffSortedStandingsByGroup[5].at(0),
            playoffSortedStandingsByGroup[4].at(1),
            playoffSortedStandingsByGroup[7].at(0),
            playoffSortedStandingsByGroup[6].at(1),
        ]

        res.status(200).send({
            firstQuadrant,
            secondQuadrant,
            thirdQuadrant,
            fourthQuadrant,
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const postWorldCupNewMatchController = async (req, res) => {
    try {
        const matches = req.body
        const newMatches = await originateManyMatches(matches)
        res.status(200).send(newMatches)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getWorldCupPlayoffMatchesController = async (req, res) => {
    const { tournament } = req.params
    try {
        // const tournamentFromDB = await retrieveTournamentById(tournament)
        const matches = await orderPlayoffMatchesFromTournamentById(tournament)
        res.status(200).send(matches)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getStatisticsController = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const response = {
            playerStats: [],
            recentMatches: [],
            accolades: {},
        }
        let count = 0

        const playerWins = []
        const playerDraws = []
        const playerLosses = []

        const matches = await retrieveMatches({})

        const amountOfRecentMatchesToDisplay = 8

        for (let {
            playerP1,
            playerP2,
            teamP1,
            teamP2,
            scoreP1,
            scoreP2,
            tournament,
            id,
            updatedAt,
        } of matches) {
            response.recentMatches.push({
                playerP1,
                playerP2,
                teamP1,
                teamP2,
                scoreP1,
                scoreP2,
                tournament: tournament.name,
                date: updatedAt
                    ? new Date(updatedAt).toLocaleString()
                    : new Date(
                          parseInt(id.substring(0, 8), 16) * 1000
                      ).toLocaleDateString(),
            })
            if (
                response.recentMatches.length === amountOfRecentMatchesToDisplay
            )
                break
        }

        players.forEach(async ({ nickname, _id }) => {
            let totalMatches = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.name === nickname || playerP2.name === nickname
            ).length

            let wins = matches.filter(
                ({ outcome }) => outcome?.playerThatWon?.name === nickname
            ).length

            let losses = matches.filter(
                ({ outcome }) => outcome?.playerThatLost?.name === nickname
            ).length

            let draws = totalMatches - wins - losses

            playerWins.push({
                player: nickname,
                wins,
            })

            playerDraws.push({
                player: nickname,
                draws,
            })

            playerLosses.push({
                player: nickname,
                losses,
            })

            response.playerStats.push({
                player: nickname,
                wins,
                draws,
                losses,
                totalMatches,
                effectiveness: Number(
                    (((wins * 3 + draws) / (totalMatches * 3)) * 100).toFixed(2)
                ),
            })

            count++
            if (count === players.length) {
                let sortedPlayerWins = playerWins.sort((a, b) =>
                    a.wins > b.wins ? -1 : 1
                )
                let sortedPlayerDraws = playerDraws.sort((a, b) =>
                    a.draws > b.draws ? -1 : 1
                )
                let sortedPlayerLosses = playerLosses.sort((a, b) =>
                    a.losses > b.losses ? -1 : 1
                )
                response.accolades.mostWins = {
                    player: sortedPlayerWins[0].player,
                    wins: sortedPlayerWins[0].wins,
                }
                response.accolades.mostDraws = {
                    player: sortedPlayerDraws[0].player,
                    draws: sortedPlayerDraws[0].draws,
                }
                response.accolades.mostLosses = {
                    player: sortedPlayerLosses[0].player,
                    losses: sortedPlayerLosses[0].losses,
                }
                res.status(200).send(response)
            }
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getStreaksController = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const response = {
            playerStreaks: [],
        }

        let count = 0

        players.forEach(async ({ nickname }) => {
            let recentMatches = await retrieveRecentMatchesFromPlayer(nickname)

            let streak = recentMatches
                .map(
                    ({
                        playerP1,
                        teamP1,
                        scoreP1,
                        playerP2,
                        teamP2,
                        scoreP2,
                        outcome,
                        id,
                        tournament,
                        updatedAt,
                    }) => {
                        const { playerThatWon } = outcome
                        const { playerThatLost } = outcome

                        if (playerThatWon && playerThatWon.name == nickname)
                            return {
                                outcome: "w",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                                tournament: tournament.name,
                            }
                        else if (
                            playerThatLost &&
                            playerThatLost.name == nickname
                        )
                            return {
                                outcome: "l",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                                tournament: tournament.name,
                            }
                        else
                            return {
                                outcome: "d",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: updatedAt
                                    ? new Date(updatedAt).toLocaleString()
                                    : new Date(
                                          parseInt(id.substring(0, 8), 16) *
                                              1000
                                      ).toLocaleDateString(),
                                tournament: tournament.name,
                            }
                    }
                )
                .reverse()

            response.playerStreaks.push({
                player: nickname,
                streak,
            })

            count++

            if (count === players.length) {
                res.status(200).send(response)
            }
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getAllTimeStandingsController = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const matches = await retrieveMatches()

        const standings = []

        players.forEach(({ nickname, _id }) => {
            let played = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id == _id || playerP2.id == _id
            ).length
            let wins = matches.filter(
                ({ outcome }) => outcome.playerThatWon?.id == _id
            ).length
            let draws = matches.filter(
                ({ playerP1, playerP2, outcome }) =>
                    outcome.draw && (playerP1.id == _id || playerP2.id == _id)
            ).length
            let losses = matches.filter(
                ({ outcome }) => outcome.playerThatLost?.id == _id
            ).length
            let goalsFor =
                matches
                    .filter(({ playerP1 }) => playerP1.id == _id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                matches
                    .filter(({ playerP2 }) => playerP2.id == _id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)
            let goalsAgainst =
                matches
                    .filter(({ playerP1 }) => playerP1.id == _id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                matches
                    .filter(({ playerP2 }) => playerP2.id == _id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)
            let scoringDifference = goalsFor - goalsAgainst
            let points = wins * 3 + draws

            standings.push({
                player: { name: nickname, id: _id },
                played,
                wins,
                draws,
                losses,
                goalsFor,
                goalsAgainst,
                scoringDifference,
                points,
            })
        })
        let sortedStandings = standings.sort(function (a, b) {
            if (a.points > b.points) return -1
            if (a.points < b.points) return 1

            if (a.scoringDifference > b.scoringDifference) return -1
            if (a.scoringDifference < b.scoringDifference) return 1

            if (a.goalsFor > b.goalsFor) return -1
            if (a.goalsFor < b.goalsFor) return 1

            if (a.goalsAgainst > b.goalsAgainst) return 1
            if (a.goalsAgainst < b.goalsAgainst) return -1
        })

        res.status(200).send(sortedStandings)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getAllTimeGeneralStatsController = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const matches = await retrieveMatches()

        const stats = []

        players.forEach(({ nickname, _id }) => {
            let played = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.id == _id || playerP2.id == _id
            ).length
            let bestWin = matches
                .filter(({ outcome }) => outcome.playerThatWon?.id == _id)
                .sort((a, b) =>
                    a.outcome.scoringDifference > b.outcome.scoringDifference
                        ? -1
                        : 1
                )
                .at(0)
            let worstLoss = matches
                .filter(({ outcome }) => outcome.playerThatLost?.id == _id)
                .sort((a, b) =>
                    a.outcome.scoringDifference > b.outcome.scoringDifference
                        ? -1
                        : 1
                )
                .at(0)
            let bestTeam = matches
                .filter(({ outcome }) => outcome.playerThatWon?.id == _id)
                .map(({ outcome }) => outcome.teamThatWon.name)
                .reduce((acc, curr) => {
                    return acc[curr] ? ++acc[curr] : (acc[curr] = 1), acc
                }, {})

            stats.push({
                player: { name: nickname, id: _id },
                played,
                bestWin,
                worstLoss,
                bestTeam,
            })
        })

        res.status(200).send(stats)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getAllTimeFaceToFaceController = async (req, res) => {
    try {
        const players = await retrieveAllUsers()
        const matches = await retrieveMatches()

        const allMatchups = players.flatMap((v, i) =>
            players.slice(i + 1).map((w) => {
                return {
                    p1: { id: w.id, name: w.nickname },
                    p2: { id: v.id, name: v.nickname },
                }
            })
        )

        let firstPlayerWins
        let firstPlayerAmountOfWins
        let firstPlayerBestWin
        let firstPlayerDraws
        let firstPlayerLosses
        let firstPlayerAmountOfLosses
        let firstPlayerWorstLoss
        let firstPlayerAmountOfMatches
        let firstPlayerGoalsFor
        let firstPlayerGoalsAgainst
        let firstPlayerScoringDifference

        const faceToFace = []

        allMatchups.forEach(({ p1, p2 }) => {
            const selectedMatches = matches.filter(
                ({ playerP1, playerP2 }) =>
                    (playerP1.id == p1.id && playerP2.id == p2.id) ||
                    (playerP2.id == p1.id && playerP1.id == p2.id)
            )

            firstPlayerWins = selectedMatches.filter(({ outcome }) => {
                let { playerThatWon } = outcome
                return playerThatWon && playerThatWon.id == p1.id
            })

            firstPlayerBestWin = firstPlayerWins.sort((a, b) =>
                a.outcome.scoringDifference > b.outcome.scoringDifference
                    ? -1
                    : 1
            )[0].outcome

            firstPlayerAmountOfWins = firstPlayerWins.length

            firstPlayerDraws = selectedMatches.filter(({ outcome }) => {
                let { draw } = outcome
                return draw
            }).length

            firstPlayerLosses = selectedMatches.filter(({ outcome }) => {
                let { playerThatLost } = outcome
                return playerThatLost && playerThatLost.id == p1.id
            })

            firstPlayerWorstLoss = firstPlayerLosses.sort((a, b) =>
                a.outcome.scoringDifference > b.outcome.scoringDifference
                    ? -1
                    : 1
            )[0].outcome

            firstPlayerAmountOfLosses = firstPlayerLosses.length

            firstPlayerGoalsFor =
                selectedMatches
                    .filter(({ playerP1 }) => playerP1.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0) +
                selectedMatches
                    .filter(({ playerP2 }) => playerP2.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0)

            firstPlayerGoalsAgainst =
                selectedMatches
                    .filter(({ playerP1 }) => playerP1.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP2
                    }, 0) +
                selectedMatches
                    .filter(({ playerP2 }) => playerP2.id == p1.id)
                    .reduce((acc, curr) => {
                        return acc + curr.scoreP1
                    }, 0)

            firstPlayerScoringDifference =
                firstPlayerGoalsFor - firstPlayerGoalsAgainst

            faceToFace.push({
                p1: {
                    id: p1.id,
                    name: p1.name,
                    played:
                        firstPlayerAmountOfWins +
                        firstPlayerDraws +
                        firstPlayerAmountOfLosses,
                    wins: firstPlayerAmountOfWins,
                    bestWin: firstPlayerBestWin,
                    draws: firstPlayerDraws,
                    losses: firstPlayerAmountOfLosses,
                    goalsFor: firstPlayerGoalsFor,
                    goalsAgainst: firstPlayerGoalsAgainst,
                    scoringDifference: firstPlayerScoringDifference,
                },
                p2: {
                    id: p2.id,
                    name: p2.name,
                    played:
                        firstPlayerAmountOfWins +
                        firstPlayerDraws +
                        firstPlayerAmountOfLosses,
                    wins: firstPlayerAmountOfLosses,
                    bestWin: firstPlayerWorstLoss,
                    draws: firstPlayerDraws,
                    losses: firstPlayerAmountOfWins,
                    goalsFor: firstPlayerGoalsAgainst,
                    goalsAgainst: firstPlayerGoalsFor,
                    scoringDifference:
                        firstPlayerGoalsAgainst - firstPlayerGoalsFor,
                },
            })
        })

        res.status(200).send(faceToFace)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

// const majorUpdatesController = async (req, res) => {
//     try {
//         const matches = await modifyManyMatches()

//         res.send(matches)
//     } catch (err) {
//         console.log(err)
//     }
// }

module.exports = {
    getHomeController,
    postRegisterController,
    postLoginController,
    postLogoutController,
    getIsUserAuthenticatedController,
    getTournamentsController,
    postTournamentsController,
    getTournamentByIdController,
    getFixtureByTournamentIdController,
    getPlayersFromTournamentController,
    // postFixtureController,
    getStandingsFromTournamentController,
    getStandingsPlayerInfoFromTournamentController,
    getPlayoffsTableController,
    getPlayoffsPlayerInfoController,
    getPlayoffsBracketController,
    getPlayoffsUpdatedWinsController,
    getUsersController,
    getMatchesController,
    postMatchesController,
    getOriginateGameController,
    postOriginateGameController,
    putModifyGameController,
    putRemoveGameController,
    // putWorldCupTeamAssignmentController,
    getWorldCupStandingsController,
    getWorldCupPlayoffTeamsController,
    postWorldCupNewMatchController,
    getWorldCupPlayoffMatchesController,
    getStatisticsController,
    getStreaksController,
    getAllTimeStandingsController,
    getAllTimeGeneralStatsController,
    getAllTimeFaceToFaceController,
    // majorUpdatesController,
}
