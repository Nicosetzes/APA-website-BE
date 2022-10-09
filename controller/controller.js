const {
    originateUser,
    retrieveUserById,
    retrieveUserByUserName,
    retrieveAllPlayers,
    // retrievePlayer,
    retrieveRecentMatchesFromPlayer,
    // retrieveWonMatchesFromPlayer,
    // totalMatchesFromAPlayerTeam,
    // totalMatchesFromPlayerByTournament,
    // totalWinsFromPlayerByTournament,
    // totalLossesFromPlayerByTournament,
    totalMatchesFromPlayer,
    // retrieveTeamsWithAtLeastOneWinFromPlayer,
    totalWinsFromPlayer,
    totalDrawsFromPlayer,
    totalLossesFromPlayer,
    // orderMatchesByScoringDifference,
    orderMatchesFromTournamentById,
    originateMatch,
    originateManyMatches,
    modifyMatchResult,
    modifyMatchResultToRemoveIt,
    retrieveMatchById,
    deleteMatchById,
    retrieveMatchesByQuery,
    retrieveMatches,
    // retrieveTournamentNames,
    retrieveTournamentTeamsByTournamentId,
    retrieveTournamentPlayersByTournamentId,
    // retrieveRecentTournamentNames,
    retrieveOngoingTournaments,
    retrieveTournamentById,
    originateTournament,
    // retrieveTournaments,
    // modifyFixtureFromTournamentVersionOne,
    // modifyFixtureFromTournamentVersionTwo,
    // modifyFixtureFromTournamentWhenEditing,
    // modifyFixtureFromTournamentWhenRemoving,
    modifyTeamsFromTournament,
    // modifyFixtureFromTournamentWhenCreated,
    // modifyManyMatches,
} = require("./../service/service.js")

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
    try {
        const tournaments = await retrieveOngoingTournaments({ ongoing: true })

        res.status(200).json(tournaments)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const postTournamentsController = async (req, res) => {
    const { name, players, teams } = req.body
    try {
        const tournament = await originateTournament({ name, players, teams })
        res.status(200).json(tournament)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getTournamentByIdController = async (req, res) => {
    const tournamentId = req.params.id
    try {
        const tournament = await retrieveTournamentById(tournamentId)
        res.status(200).json(tournament)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getStandingsPlayerInfoController = async (req, res) => {
    try {
        const tournaments = await retrieveOngoingTournaments({ ongoing: true })

        let playerStatsByTournament = []

        tournaments.forEach(async (tournament) => {
            let { players, id } = tournament
            let matches = await orderMatchesFromTournamentById(id)

            players.forEach((player) => {
                let totalMatches = matches.filter(
                    ({ playerP1, playerP2 }) =>
                        playerP1.name === player.name ||
                        playerP2.name === player.name
                ).length

                let totalWins = matches.filter(
                    (match) =>
                        match.outcome?.playerThatWon?.name === player.name
                ).length

                let totalLosses = matches.filter(
                    (match) =>
                        match.outcome?.playerThatLost?.name === player.name
                ).length

                let totalDraws = totalMatches - totalWins - totalLosses

                let totalPoints = totalWins * 3 + totalDraws

                let streak = matches
                    .filter(
                        ({ playerP1, playerP2 }) =>
                            playerP1.name === player.name ||
                            playerP2.name === player.name
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
                        }) => {
                            const { playerThatWon } = outcome
                            const { playerThatLost } = outcome
                            const { teamThatWon } = outcome
                            const { scoreFromTeamThatWon } = outcome
                            const { teamThatLost } = outcome
                            const { scoreFromTeamThatLost } = outcome
                            if (
                                playerThatWon &&
                                playerThatWon.name == player.name
                            )
                                return {
                                    outcome: "w",
                                    playerP1: playerThatWon,
                                    teamP1: teamThatWon,
                                    scoreP1: scoreFromTeamThatWon,
                                    playerP2: playerThatLost,
                                    teamP2: teamThatLost,
                                    scoreP2: scoreFromTeamThatLost,
                                    date: new Date(
                                        parseInt(id.substring(0, 8), 16) * 1000
                                    ).toLocaleDateString(),
                                }
                            if (
                                playerThatLost &&
                                playerThatLost.name == player.name
                            )
                                return {
                                    outcome: "l",
                                    playerP1: playerThatLost,
                                    teamP1: teamThatLost,
                                    scoreP1: scoreFromTeamThatLost,
                                    playerP2: playerThatWon,
                                    teamP2: teamThatWon,
                                    scoreP2: scoreFromTeamThatWon,
                                    date: new Date(
                                        parseInt(id.substring(0, 8), 16) * 1000
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
                                    date: new Date(
                                        parseInt(id.substring(0, 8), 16) * 1000
                                    ).toLocaleDateString(),
                                }
                        }
                    )
                    .reverse()

                playerStatsByTournament.push({
                    player,
                    tournament: tournament.name,
                    totalMatches,
                    totalWins,
                    totalDraws,
                    totalLosses,
                    totalPoints,
                    streak,
                })
                if (
                    playerStatsByTournament.length ===
                    players.length * tournaments.length
                )
                    res.send(playerStatsByTournament)
            })
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getFixtureByTournamentIdController = async (req, res) => {
    // IMPORTANT: Have to remake once this tournament is finished //
    const tournamentId = req.params.id
    try {
        const tournament = await retrieveTournamentById(tournamentId)
        res.status(200).json(tournament)
        // Agregar excepción en caso de error
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const { fixture } = require("./../fixture-generation")

const postFixtureController = async (req, res) => {
    try {
        const { players, teams } = req.body
        const tournamentId = req.params.id
        const assignmentArray = []

        const tournament = await retrieveTournamentById(tournamentId)

        const teamsFromTournament = tournament.teams

        teams.forEach(async (teamFromUser, index) => {
            let { team } = teamsFromTournament.filter(
                (teamFromTournament) =>
                    teamFromTournament.team.id == teamFromUser.id
            )[0] // Me quedo el único elemento de la lista

            let assignment = {
                team,
                player: players[index],
            }

            assignmentArray.push(assignment)
        })

        // Actualizo "teams" dentro del torneo, para sumar la info de qué jugadores juegan con qué equipos. Es necesario para los standings //

        // console.log(assignmentArray)

        const updatedTournament = await modifyTeamsFromTournament(
            tournamentId,
            assignmentArray
        ) // Chequear //

        // assignmentArray.forEach(async ({ team, player }) => {
        //     await modifyTeamsFromTournament(tournamentId, teams)
        // })

        // const updatedTournament = await retrieveTournamentById(tournamentId)

        const playersForFixtureGeneration = updatedTournament.players // REVISAR

        const tournamentForFixtureGeneration = {
            name: tournament.name,
            id: tournament.id,
        }

        const definitiveFixture = fixture(
            assignmentArray,
            playersForFixtureGeneration,
            tournamentForFixtureGeneration
            // REVISAR
        ) // GENERO EL FIXTURE

        if (!definitiveFixture.error) {
            // const matchesToBePlayed = definitiveFixture.map((match) => {
            //     return {
            //         playerP1: match.playerP1,
            //         playerP2: match.playerP2,
            //         teamP1: match.teamP1,
            //         teamP2: match.teamP2,
            //         teamIdP1: match.teamIdP1,
            //         teamIdP2: match.teamIdP2,
            //         scoreP1: null,
            //         scoreP2: null,
            //         tournament: {
            //             name: tournament.name,
            //             id: tournament.id,
            //         },
            //     }
            // })

            await originateManyMatches(definitiveFixture)

            res.status(200).send({ status: "ok" })
        }
    } catch (err) {
        res.status(500).send("Something went wrong" + err)
    }
}

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
    // const tournamentId = req.params.id
    const matchId = req.params.match
    try {
        // const tournament = await retrieveTournamentById(tournamentId)

        let {
            playerP1,
            teamP1,
            scoreP1,
            playerP2,
            teamP2,
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

const getStandingsController = async (req, res) => {
    try {
        const tournaments = await retrieveOngoingTournaments({ ongoing: true })

        const standingsArray = []

        let counter = 0

        tournaments.forEach(async (tournament) => {
            const standings = []

            let matches = await orderMatchesFromTournamentById(tournament.id)

            tournament.teams.forEach(async (team) => {
                let played = matches.filter(
                    ({ teamP1, teamP2 }) =>
                        teamP1.name === team.team || teamP2.name === team.team
                ).length
                let wins = matches.filter(
                    ({ outcome }) => outcome?.teamThatWon?.name === team.team
                ).length
                let draws = matches.filter(
                    ({ teamP1, teamP2, outcome }) =>
                        (teamP1.name === team.team ||
                            teamP2.name === team.team) &&
                        outcome.draw
                ).length
                let losses = matches.filter(
                    ({ outcome }) => outcome?.teamThatLost?.name === team.team
                ).length
                let goalsFor =
                    matches
                        .filter(({ teamP1 }) => teamP1.name === team.team)
                        .reduce((acc, curr) => {
                            return acc + curr.scoreP1
                        }, 0) +
                    matches
                        .filter(({ teamP2 }) => teamP2.name === team.team)
                        .reduce((acc, curr) => {
                            return acc + curr.scoreP2
                        }, 0)
                let goalsAgainst =
                    matches
                        .filter(({ teamP1 }) => teamP1.name === team.team)
                        .reduce((acc, curr) => {
                            return acc + curr.scoreP2
                        }, 0) +
                    matches
                        .filter(({ teamP2 }) => teamP2.name === team.team)
                        .reduce((acc, curr) => {
                            return acc + curr.scoreP1
                        }, 0)
                let scoringDifference = goalsFor - goalsAgainst
                let points = wins * 3 + draws
                let streak = matches
                    .filter(
                        ({ teamP1, teamP2 }) =>
                            teamP1.name === team.team ||
                            teamP2.name === team.team
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
                        }) => {
                            const {
                                playerThatWon,
                                teamThatWon,
                                scoreFromTeamThatWon,
                                playerThatLost,
                                teamThatLost,
                                scoreFromTeamThatLost,
                            } = outcome
                            if (teamThatWon && teamThatWon.name === team.team)
                                return {
                                    outcome: "w",
                                    playerP1: playerThatWon,
                                    teamP1: teamThatWon,
                                    scoreP1: scoreFromTeamThatWon,
                                    playerP2: playerThatLost,
                                    teamP2: teamThatLost,
                                    scoreP2: scoreFromTeamThatLost,
                                    date: new Date(
                                        parseInt(id.substring(0, 8), 16) * 1000
                                    ).toLocaleDateString(),
                                }
                            if (teamThatLost && teamThatLost.name === team.team)
                                return {
                                    outcome: "l",
                                    playerP1: playerThatLost,
                                    teamP1: teamThatLost,
                                    scoreP1: scoreFromTeamThatLost,
                                    playerP2: playerThatWon,
                                    teamP2: teamThatWon,
                                    scoreP2: scoreFromTeamThatWon,
                                    date: new Date(
                                        parseInt(id.substring(0, 8), 16) * 1000
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
                                    date: new Date(
                                        parseInt(id.substring(0, 8), 16) * 1000
                                    ).toLocaleDateString(),
                                }
                        }
                    )
                    .reverse()

                let { id, player, teamCode } = team

                standings.push({
                    id,
                    team: team.team,
                    player, // REVISAR
                    teamCode,
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

            let sortedStanding = standings.sort(function (a, b) {
                if (a.points > b.points) return -1
                if (a.points < b.points) return 1

                if (a.scoringDifference > b.scoringDifference) return -1
                if (a.scoringDifference < b.scoringDifference) return 1

                if (a.goalsFor > b.goalsFor) return -1
                if (a.goalsFor < b.goalsFor) return 1

                if (a.goalsAgainst > b.goalsAgainst) return 1
                if (a.goalsAgainst < b.goalsAgainst) return -1
            })

            standingsArray.push({
                name: tournament.name,
                tournamentId: tournament.id,
                sortedStanding,
            })

            counter++

            if (counter === tournaments.length) {
                res.status(200).json(standingsArray)
            }
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getPlayoffsTableController = async (req, res) => {
    const playoffsId = "6340436678316e185af86762" // Luego revertir esto //

    try {
        const playoffs = await retrieveTournamentById(playoffsId)

        const tournaments = await retrieveOngoingTournaments({ ongoing: true })

        const allTeams = []

        let counter = 0

        tournaments.forEach(async (tournament) => {
            let matches = await orderMatchesFromTournamentById(tournament.id)

            playoffs.teams.forEach(async ({ id, name, player }) => {
                let played = matches.filter(
                    ({ teamP1, teamP2 }) =>
                        teamP1.name === name || teamP2.name === name
                ).length
                let wins = matches.filter(
                    ({ outcome }) => outcome?.teamThatWon?.name === name
                ).length
                let draws = matches.filter(
                    ({ teamP1, teamP2, outcome }) =>
                        (teamP1.name === name || teamP2.name === name) &&
                        outcome.draw
                ).length
                let losses = matches.filter(
                    ({ outcome }) => outcome?.teamThatLost?.name === name
                ).length
                let goalsFor =
                    matches
                        .filter(({ teamP1 }) => teamP1.name === name)
                        .reduce((acc, curr) => {
                            return acc + curr.scoreP1
                        }, 0) +
                    matches
                        .filter(({ teamP2 }) => teamP2.name === name)
                        .reduce((acc, curr) => {
                            return acc + curr.scoreP2
                        }, 0)
                let goalsAgainst =
                    matches
                        .filter(({ teamP1 }) => teamP1.name === name)
                        .reduce((acc, curr) => {
                            return acc + curr.scoreP2
                        }, 0) +
                    matches
                        .filter(({ teamP2 }) => teamP2.name === name)
                        .reduce((acc, curr) => {
                            return acc + curr.scoreP1
                        }, 0)
                let scoringDifference = goalsFor - goalsAgainst
                let points = wins * 3 + draws

                allTeams.push({
                    id,
                    team: name,
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
                let sortedPlayoffsTeams = allTeams.sort(function (a, b) {
                    if (a.points > b.points) return -1
                    if (a.points < b.points) return 1

                    if (a.scoringDifference > b.scoringDifference) return -1
                    if (a.scoringDifference < b.scoringDifference) return 1

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
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getPlayoffsPlayerInfoController = async (req, res) => {
    try {
        const tournaments = await retrieveOngoingTournaments({ ongoing: true })

        let allMatches = []

        let matchesFromOngoingTournaments = []

        let counter = 0

        tournaments.forEach(async ({ id }) => {
            let matches = await orderMatchesFromTournamentById(id)
            if (!allMatches.length) {
                allMatches = matches
            } else {
                matchesFromOngoingTournaments = allMatches.concat(matches)
            }
            counter++
            if (counter === tournaments.length) {
                // REVISAR

                const playoffsPlayerStats = []

                const players = await retrieveAllPlayers()

                players.forEach((player) => {
                    let totalMatches = matchesFromOngoingTournaments.filter(
                        ({ playerP1, playerP2 }) =>
                            playerP1.name == player.name ||
                            playerP2.name == player.name
                    ).length

                    let totalWins = matchesFromOngoingTournaments.filter(
                        ({ outcome }) =>
                            outcome?.playerThatWon?.name == player.name
                    ).length

                    let totalLosses = matchesFromOngoingTournaments.filter(
                        ({ outcome }) =>
                            outcome?.playerThatLost?.name == player.name
                    ).length

                    let totalDraws = totalMatches - totalWins - totalLosses

                    let totalPoints = totalWins * 3 + totalDraws

                    playoffsPlayerStats.push({
                        player: {
                            name: player.name,
                            id: player._id,
                        },
                        totalMatches,
                        totalWins,
                        totalDraws,
                        totalLosses,
                        totalPoints,
                    })
                    if (playoffsPlayerStats.length === players.length)
                        res.send(playoffsPlayerStats)
                })
            }
        })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getPlayersController = async (req, res) => {
    // const { query } = req.query
    try {
        const allPlayers = await retrieveAllPlayers()
        const players = allPlayers.map(({ _id, name }) => {
            return {
                id: _id,
                name,
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
            const matches = await retrieveMatchesByQuery(query)
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
        }

        const createdMatch = await originateMatch(match)

        createdMatch && res.status(200).send(createdMatch)
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

const getStatisticsController = async (req, res) => {
    try {
        const players = await retrieveAllPlayers()
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
        } of matches) {
            response.recentMatches.push({
                playerP1,
                playerP2,
                teamP1,
                teamP2,
                scoreP1,
                scoreP2,
                tournament: tournament.name,
                date: new Date(
                    parseInt(id.substring(0, 8), 16) * 1000
                ).toLocaleDateString(),
            })
            if (
                response.recentMatches.length === amountOfRecentMatchesToDisplay
            )
                break
        }

        players.forEach(async (player) => {
            let totalMatches = matches.filter(
                ({ playerP1, playerP2 }) =>
                    playerP1.name === player.name ||
                    playerP2.name === player.name
            ).length

            let wins = matches.filter(
                ({ outcome }) => outcome?.playerThatWon?.name === player.name
            ).length

            let losses = matches.filter(
                ({ outcome }) => outcome?.playerThatLost?.name === player.name
            ).length

            let draws = totalMatches - wins - losses

            playerWins.push({
                player: player.name,
                wins,
            })

            playerDraws.push({
                player: player.name,
                draws,
            })

            playerLosses.push({
                player: player.name,
                losses,
            })

            response.playerStats.push({
                player: player.name,
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
        const players = await retrieveAllPlayers()
        const response = {
            playerStreaks: [],
        }

        let count = 0

        players.forEach(async (player) => {
            let recentMatches = await retrieveRecentMatchesFromPlayer(
                player.name
            )

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
                    }) => {
                        const { playerThatWon } = outcome
                        const { playerThatLost } = outcome

                        if (playerThatWon && playerThatWon.name == player.name)
                            return {
                                outcome: "w",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: new Date(
                                    parseInt(id.substring(0, 8), 16) * 1000
                                ).toLocaleDateString(),
                                tournament: tournament.name,
                            }
                        else if (
                            playerThatLost &&
                            playerThatLost.name == player.name
                        )
                            return {
                                outcome: "l",
                                playerP1,
                                teamP1,
                                scoreP1,
                                playerP2,
                                teamP2,
                                scoreP2,
                                date: new Date(
                                    parseInt(id.substring(0, 8), 16) * 1000
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
                                date: new Date(
                                    parseInt(id.substring(0, 8), 16) * 1000
                                ).toLocaleDateString(),
                                tournament: tournament.name,
                            }
                    }
                )
                .reverse()

            response.playerStreaks.push({
                player: player.name,
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

const hasANumberOfMatchesAchievement = async (
    amount,
    amoutOfMatchesFromPlayer
) => {
    // console.log(`${player}: ${allMatchesFromPlayer}`)
    let hasAchievement = false
    if (amoutOfMatchesFromPlayer >= amount) hasAchievement = true
    return hasAchievement
}

const hasANumberOfWinsAchievement = async (amount, amountOfWinsFromPlayer) => {
    let hasAchievement = false
    if (amountOfWinsFromPlayer >= amount) hasAchievement = true
    return hasAchievement
}

const hasANumberOfDrawsAchievement = async (
    amount,
    amountOfDrawsFromPlayer
) => {
    let hasAchievement = false
    if (amountOfDrawsFromPlayer >= amount) hasAchievement = true
    return hasAchievement
}

const achievements = async (req, res) => {
    try {
        const responseArray = []
        const players = await retrieveAllPlayers()
        players.forEach(async (player, index) => {
            let amoutOfMatchesFromPlayer = await totalMatchesFromPlayer(
                player.name
            )
            let amountOfWinsFromPlayer = await totalWinsFromPlayer(player.name)
            let amountOfDrawsFromPlayer = await totalDrawsFromPlayer(
                player.name
            )
            let hasAHundredMatches = await hasANumberOfMatchesAchievement(
                100,
                amoutOfMatchesFromPlayer
            )
            let hasTwoHundredAndFiftyMatches =
                await hasANumberOfMatchesAchievement(
                    250,
                    amoutOfMatchesFromPlayer
                )
            let hasFiveHundredMatches = await hasANumberOfMatchesAchievement(
                500,
                amoutOfMatchesFromPlayer
            )

            let hasAThousandMatches = await hasANumberOfMatchesAchievement(
                1000,
                amoutOfMatchesFromPlayer
            )

            let hasTwentyFiveWins = await hasANumberOfWinsAchievement(
                25,
                amountOfWinsFromPlayer
            )

            let hasFiftyWins = await hasANumberOfWinsAchievement(
                50,
                amountOfWinsFromPlayer
            )

            let hasAHundredWins = await hasANumberOfWinsAchievement(
                100,
                amountOfWinsFromPlayer
            )

            let hasAHundredAndFiftyWins = await hasANumberOfWinsAchievement(
                150,
                amountOfWinsFromPlayer
            )

            let hasTwoHundredAndFiftyWins = await hasANumberOfWinsAchievement(
                250,
                amountOfWinsFromPlayer
            )

            let hasTwentyFiveDraws = await hasANumberOfDrawsAchievement(
                25,
                amountOfDrawsFromPlayer
            )

            let hasFiftyDraws = await hasANumberOfDrawsAchievement(
                50,
                amountOfDrawsFromPlayer
            )

            let hasSeventyFiveDraws = await hasANumberOfDrawsAchievement(
                75,
                amountOfDrawsFromPlayer
            )

            let hasAHundredDraws = await hasANumberOfDrawsAchievement(
                100,
                amountOfDrawsFromPlayer
            )
            Promise.all([
                hasAHundredMatches,
                hasTwoHundredAndFiftyMatches,
                hasFiveHundredMatches,
                hasAThousandMatches,
                hasTwentyFiveWins,
                hasFiftyWins,
                hasAHundredWins,
                hasAHundredAndFiftyWins,
                hasTwoHundredAndFiftyWins,
                hasTwentyFiveDraws,
                hasFiftyDraws,
                hasSeventyFiveDraws,
                hasAHundredDraws,
            ])
                .then((values) => {
                    let hasAHundredMatches = values[0]
                    let hasTwoHundredAndFiftyMatches = values[1]
                    let hasFiveHundredMatches = values[2]
                    let hasAThousandMatches = values[3]
                    let hasTwentyFiveWins = values[4]
                    let hasFiftyWins = values[5]
                    let hasAHundredWins = values[6]
                    let hasAHundredAndFiftyWins = values[7]
                    let hasTwoHundredAndFiftyWins = values[8]
                    let hasTwentyFiveDraws = values[9]
                    let hasFiftyDraws = values[10]
                    let hasSeventyFiveDraws = values[11]
                    let hasAHundredDraws = values[12]
                    return {
                        player,
                        hasAHundredMatches,
                        hasTwoHundredAndFiftyMatches,
                        hasFiveHundredMatches,
                        hasAThousandMatches,
                        hasTwentyFiveWins,
                        hasFiftyWins,
                        hasAHundredWins,
                        hasAHundredAndFiftyWins,
                        hasTwoHundredAndFiftyWins,
                        hasTwentyFiveDraws,
                        hasFiftyDraws,
                        hasSeventyFiveDraws,
                        hasAHundredDraws,
                    }
                })
                .then((result) => {
                    responseArray.push(result)
                    if (responseArray.length === players.length)
                        res.send(responseArray)
                })
        })
    } catch (err) {
        console.log(err)
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
    // getTournamentsPlayoffsController,
    getStandingsPlayerInfoController,
    getFixtureByTournamentIdController,
    postFixtureController,
    getStandingsController,
    getPlayoffsTableController,
    getPlayoffsPlayerInfoController,
    // getPlayoffsBracketController,
    getPlayersController,
    getMatchesController,
    postMatchesController,
    getOriginateGameController,
    postOriginateGameController,
    putModifyGameController,
    putRemoveGameController,
    getStatisticsController,
    getStreaksController,
    achievements,
    // majorUpdatesController,
}
