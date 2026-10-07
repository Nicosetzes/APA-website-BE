const { HttpError } = require("../../middleware/httpErrors")
const { classifySeriesMatch } = require("../../service/playoffSeries")
const logger = require("../../utils/logger")
const withTransaction = require("../../utils/withTransaction")
const {
    modifyMatchResult,
    modifyTournamentOutcome,
    retrieveTournamentById,
    retrievePlayoffMatchesByTournamentId,
    retrievePlayinMatchesByTournamentId,
    generatePlayoffUpdate,
    generatePlayinUpdate,
    processPlayoffSeriesResult,
} = require("./../../service")
const {
    getPlayoffStartSize,
    hasTabulatedFinalPlayoffId,
    isFinalPlayoffMatch,
} = require("../../config/playoffFormats")

const calculateOutcome = ({
    playerP1,
    teamP1,
    seedP1,
    scoreP1,
    penaltyScoreP1,
    playerP2,
    teamP2,
    seedP2,
    scoreP2,
    penaltyScoreP2,
}) => {
    const isKnockout = Boolean(seedP1 && seedP2)

    if (!isKnockout && scoreP1 === scoreP2) {
        return { draw: true, penalties: false }
    }

    const p1Won =
        scoreP1 !== scoreP2
            ? scoreP1 > scoreP2
            : penaltyScoreP1 > penaltyScoreP2
    const winner = p1Won
        ? { player: playerP1, team: teamP1, seed: seedP1 }
        : { player: playerP2, team: teamP2, seed: seedP2 }
    const loser = p1Won
        ? { player: playerP2, team: teamP2, seed: seedP2 }
        : { player: playerP1, team: teamP1, seed: seedP1 }
    const decidedByPenalties = isKnockout && scoreP1 === scoreP2
    const outcome = {
        playerThatWon: winner.player,
        teamThatWon: winner.team,
        scoreFromTeamThatWon: decidedByPenalties
            ? Math.max(penaltyScoreP1, penaltyScoreP2)
            : Math.max(scoreP1, scoreP2),
        playerThatLost: loser.player,
        teamThatLost: loser.team,
        scoreFromTeamThatLost: decidedByPenalties
            ? Math.min(penaltyScoreP1, penaltyScoreP2)
            : Math.min(scoreP1, scoreP2),
        draw: decidedByPenalties,
    }

    if (isKnockout) {
        outcome.seedFromTeamThatWon = winner.seed
        outcome.seedFromTeamThatLost = loser.seed
    }

    if (decidedByPenalties) {
        outcome.penalties = true
    } else {
        outcome.scoringDifference = Math.abs(scoreP1 - scoreP2)
    }

    return outcome
}

const PARTICIPANT_FIELDS = [
    "playerP1",
    "teamP1",
    "seedP1",
    "playerP2",
    "teamP2",
    "seedP2",
]

const pickParticipants = (source) =>
    Object.fromEntries(
        PARTICIPANT_FIELDS.map((field) => [field, source?.[field]])
    )

const participantKey = (field, value) =>
    String((field.startsWith("seed") ? value : value?.id) ?? "")

// Nombres de los campos cuyo id (o seed) difiere; no expone nombres.
const diffParticipants = (persisted, body) =>
    PARTICIPANT_FIELDS.filter(
        (field) =>
            participantKey(field, persisted[field]) !==
            participantKey(field, body[field])
    )

const createPutMatchByTournamentId = (dependencies = {}) => {
    const updateMatch = dependencies.modifyMatchResult || modifyMatchResult
    const updateTournament =
        dependencies.modifyTournamentOutcome || modifyTournamentOutcome
    const getTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const getPlayoffMatches =
        dependencies.retrievePlayoffMatchesByTournamentId ||
        retrievePlayoffMatchesByTournamentId
    const updatePlayoff =
        dependencies.generatePlayoffUpdate || generatePlayoffUpdate
    const getPlayinMatches =
        dependencies.retrievePlayinMatchesByTournamentId ||
        retrievePlayinMatchesByTournamentId
    const updatePlayin =
        dependencies.generatePlayinUpdate || generatePlayinUpdate
    const processSeries =
        dependencies.processPlayoffSeriesResult || processPlayoffSeriesResult
    const runInTransaction = dependencies.withTransaction || withTransaction
    const log = dependencies.logger || logger

    return async (req, res) => {
        const { tournament, match } = req.params
        const classification = classifySeriesMatch({
            tournament: req.tournament || {},
            match: req.match || {},
        })
        if (["series_leg", "decisive"].includes(classification)) {
            const result = await processSeries({
                tournamentId: tournament,
                matchId: match,
                body: req.body,
                requestId: req.requestId || null,
            })
            return res.status(200).send(result)
        }
        if (classification === "invalid") {
            throw new HttpError(
                409,
                "PLAYOFF_CONFIGURATION_ERROR",
                "La configuración de la serie de playoff es inválida"
            )
        }

        const {
            playerP1,
            teamP1,
            seedP1,
            scoreP1: scoreP1AsString,
            penaltyScoreP1: penaltyScoreP1AsString,
            playerP2,
            teamP2,
            seedP2,
            scoreP2: scoreP2AsString,
            penaltyScoreP2: penaltyScoreP2AsString,
            valid,
        } = req.body

        const scoreP1 = Number(scoreP1AsString)
        const scoreP2 = Number(scoreP2AsString)
        const penaltyScoreP1 = Number(penaltyScoreP1AsString)
        const penaltyScoreP2 = Number(penaltyScoreP2AsString)

        // Los participantes salen del partido guardado: el body puede venir
        // de una vista desactualizada y dejaría un ganador que no juega el
        // partido (D6). El body sólo se usa si no hay partido cargado.
        const bodyParticipants = {
            playerP1,
            teamP1,
            seedP1,
            playerP2,
            teamP2,
            seedP2,
        }
        const participants = req.match
            ? pickParticipants(req.match)
            : bodyParticipants

        if (req.match) {
            const mismatches = diffParticipants(participants, bodyParticipants)
            if (mismatches.length) {
                log.warn("match_result_participants_mismatch", {
                    requestId: req.requestId || null,
                    tournamentId: tournament,
                    matchId: match,
                    fields: mismatches,
                })
            }
        }

        const outcome = calculateOutcome({
            ...participants,
            scoreP1,
            penaltyScoreP1,
            scoreP2,
            penaltyScoreP2,
        })

        const uploadedMatch = await runInTransaction(async (session) => {
            const options = { session }
            // `previous` sólo viaja al update del partido: decide su playedAt.
            const updatedMatch = await updateMatch(
                match,
                scoreP1,
                scoreP2,
                outcome,
                valid,
                { ...options, previous: req.match }
            )

            if (!updatedMatch) {
                throw new HttpError(
                    404,
                    "MATCH_NOT_FOUND",
                    "No se encontró el partido a actualizar"
                )
            }

            if (
                updatedMatch.type === "playoff" &&
                updatedMatch.tournament?.id
            ) {
                const tournamentData = await getTournament(
                    updatedMatch.tournament.id,
                    options
                )

                if (!tournamentData) {
                    throw new HttpError(
                        404,
                        "TOURNAMENT_NOT_FOUND",
                        "No se encontró el torneo del partido"
                    )
                }

                // La derivación falla cerrada: si no reconoce la final, el
                // torneo queda abierto. Los dos casos en los que eso puede ser
                // un dato anómalo y no una ronda intermedia quedan logueados,
                // porque desde HTTP la respuesta sigue siendo 200.
                if (
                    !Number.isInteger(Number(updatedMatch.playoff_id)) ||
                    !hasTabulatedFinalPlayoffId(tournamentData.format)
                ) {
                    log.warn("playoff_final_not_derivable", {
                        requestId: req.requestId || null,
                        tournamentId: tournamentData.id,
                        format: tournamentData.format ?? null,
                        playoffId: updatedMatch.playoff_id ?? null,
                    })
                }

                // La final se deriva del formato y del `playoff_id` guardado,
                // no de lo que declare el cliente.
                if (
                    isFinalPlayoffMatch({
                        format: tournamentData.format,
                        type: updatedMatch.type,
                        playoffId: updatedMatch.playoff_id,
                    })
                ) {
                    const champion = {
                        team: outcome.teamThatWon,
                        player: outcome.playerThatWon,
                    }
                    const finalist = {
                        team: outcome.teamThatLost,
                        player: outcome.playerThatLost,
                    }
                    // El torneo cierra con la fecha de la final (D3).
                    await updateTournament(
                        tournament,
                        champion,
                        finalist,
                        options,
                        {
                            closedAt: updatedMatch.playedAt ?? new Date(),
                            closedAtPrecision: updatedMatch.playedAt
                                ? updatedMatch.playedAtPrecision ?? "exact"
                                : "exact",
                        }
                    )
                }

                if (tournamentData.format !== "champions_league") {
                    const startSize = getPlayoffStartSize(tournamentData.format)
                    const playoffMatches = await getPlayoffMatches(
                        updatedMatch.tournament.id,
                        options
                    )

                    await updatePlayoff(
                        {
                            id: tournamentData.id,
                            name: tournamentData.name,
                        },
                        playoffMatches,
                        startSize,
                        options
                    )
                }
            }

            if (updatedMatch.type === "playin" && updatedMatch.tournament?.id) {
                const playinMatches = await getPlayinMatches(
                    updatedMatch.tournament.id,
                    options
                )

                await updatePlayin(
                    {
                        id: updatedMatch.tournament.id,
                        name: updatedMatch.tournament.name,
                    },
                    playinMatches,
                    options
                )
            }

            return updatedMatch
        })

        return res.status(200).send(uploadedMatch)
    }
}

const putMatchByTournamentId = createPutMatchByTournamentId()

module.exports = putMatchByTournamentId
module.exports.calculateOutcome = calculateOutcome
module.exports.createPutMatchByTournamentId = createPutMatchByTournamentId
