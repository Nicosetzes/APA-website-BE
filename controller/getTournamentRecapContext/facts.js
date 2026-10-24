const {
    BIG_WIN_MARGIN,
    CINDERELLA_OVERALL_GAP,
    CLEAN_SHEETS_LEADER_MIN,
    FACTS_MAX,
    LEADER_CHANGES_MIN,
    LONG_LOSING_STREAK_MIN,
    LONG_UNBEATEN_MIN,
    LONG_WIN_STREAK_MIN,
    RATING_MOVE_MIN_DELTA,
    STANDINGS_OVERPERFORMANCE_MIN_POINTS,
    TEAM_STATS_MIN_MATCHES,
    UPSET_WINNER_EXPECTED_MAX,
} = require("../../config/tournamentRecap")
const { round } = require("../../service/playerRatings/presentation")

const ROUND_LABELS = {
    round_of_32: "16avos de final",
    round_of_16: "octavos de final",
    quarterfinal: "cuartos de final",
    semifinal: "semifinales",
    final: "la final",
}

const EARLY_ROUNDS = ["round_of_32", "round_of_16", "quarterfinal"]
const LATE_ROUNDS = ["semifinal", "final"]

const percent = (probability) => Math.round(probability * 100)

const ordinal = (n) => `${n}º`

const scoreText = (score) => `${score[0]}-${score[1]}`

const roundText = (roundName) => ROUND_LABELS[roundName] ?? "el cuadro"

const sideOfWinner = (entry) => (entry.winner === "p1" ? entry.p1 : entry.p2)
const sideOfLoser = (entry) => (entry.winner === "p1" ? entry.p2 : entry.p1)

const describeMatch = (entry) => {
    const winner = sideOfWinner(entry)
    const loser = sideOfLoser(entry)

    return `${winner.player} (${winner.team}) a ${loser.player} (${loser.team})`
}

// Resultado del partido con los goles del ganador primero.
const winnerFirstScore = (entry) =>
    entry.winner === "p1"
        ? scoreText(entry.score)
        : scoreText([...entry.score].reverse())

// Lo que el modelo esperaba del ganador, dicho como corresponde a su tipo:
// solo un cruce de partido único tiene una probabilidad de avanzar que se pueda
// citar; en el resto el empate vale 0,5 y se habla de rendimiento. En la final
// no se avanza de ronda: se queda con el título.
const underdogText = (entry) => {
    if (entry.odds?.kind !== "advance")
        return "rindió por encima de lo esperado"

    return entry.round === "final"
        ? `el modelo le daba ${percent(
              entry.expectedWinner
          )}% de quedarse con el título`
        : `el modelo le daba ${percent(
              entry.expectedWinner
          )}% de avanzar en el cuadro`
}

const makeFact = (
    type,
    importance,
    text,
    { matchIds = [], data = {}, suffix = "" } = {}
) => ({
    id: suffix ? `${type}:${suffix}` : type,
    type,
    importance: Math.max(1, Math.min(5, importance)),
    matchIds,
    data,
    text,
})

const uniqueMax = (items, valueOf) => {
    if (items.length === 0) return null

    const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a))

    if (sorted.length > 1 && valueOf(sorted[0]) === valueOf(sorted[1])) {
        return null
    }

    return sorted[0]
}

const titleMilestone = ({ titleContext, tournament }) => {
    if (!titleContext) return null

    const { champion, competition } = titleContext
    const name = champion.player.name
    const parts = [
        `Es el título número ${champion.titleNumber} de ${name} en la historia`,
    ]

    if (champion.isFirstTitle)
        parts[0] = `Es el primer título de ${name} en la historia`

    if (champion.gapToLeader) {
        parts.push(
            `queda a ${champion.gapToLeader.behind} de alcanzar a ${champion.gapToLeader.player.name}`
        )
    } else if (champion.leadChange === "new_leader") {
        parts.push("pasa a liderar la tabla histórica de títulos")
    } else if (champion.rank === 1) {
        parts.push("sigue liderando la tabla histórica de títulos")
    }

    if (champion.leadChange === "tied_for_lead") {
        parts.push("alcanza la cima de la tabla histórica de títulos")
    }

    const sameCompetition = champion.titlesSameCompetition.ordinal
    const label = competition.label

    const { defendedEdition, previousTitle } = champion
    const defendedJustBefore =
        defendedEdition &&
        previousTitle &&
        defendedEdition.tournamentId === previousTitle.tournamentId

    if (defendedEdition) {
        parts.push(
            `defendió el título de ${label} (que había ganado en ${
                defendedEdition.name
            }${defendedJustBefore ? ", el torneo anterior que jugó" : ""})`
        )
    } else if (sameCompetition > 1) {
        parts.push(`es su ${ordinal(sameCompetition)} título de ${label}`)
    } else {
        parts.push(`es su primer título de ${label}`)
    }

    if (previousTitle && !defendedJustBefore) {
        parts.push(`viene de ganar ${previousTitle.name}`)
    }

    return makeFact("title_milestone", 5, `${parts.join("; ")}.`, {
        data: {
            tournament: tournament.name,
            titleNumber: champion.titleNumber,
            rank: champion.rank,
            gapToLeader: champion.gapToLeader,
            leadChange: champion.leadChange,
            isFirstTitle: champion.isFirstTitle,
            consecutiveTitles: champion.consecutiveTitles,
            wasDefendingChampion: champion.wasDefendingChampion,
            defendedEdition: champion.defendedEdition,
            previousTitle: champion.previousTitle,
            titlesSameCompetition: champion.titlesSameCompetition,
            // Contadores a la fecha de cierre, ESTE torneo incluido.
            runnerUps: champion.runnerUps,
            titlesAndRunnerUps: champion.titlesAndRunnerUps,
            finalsPlayed: champion.finalsPlayed,
            finalsWon: champion.finalsWon,
            finalsLost: champion.finalsLost,
        },
    })
}

const championPathFact = ({ result, championPath }) => {
    const { champion } = result
    const parts = [
        `${champion.player.name} (${champion.team.name}) se quedó con el título`,
    ]

    if (championPath.regular) {
        const { position, points, group } = championPath.regular

        parts.push(
            `tras terminar ${position}° ${
                group ? `en el grupo ${group}` : "en la tabla"
            } con ${points} puntos`
        )
    }
    if (championPath.playin?.played) parts.push("pasando por el play-in")
    if (championPath.ties.length > 0) {
        parts.push(
            `y ganó ${
                championPath.ties.filter((tie) => tie.wonTie).length
            } cruces de eliminación`
        )
    }

    return makeFact("champion_path", 5, `${parts.join(" ")}.`, {
        data: { champion, path: championPath },
    })
}

const finalSummaryFact = ({ result }) => {
    const final = result.final

    if (!final) return null

    const winner = result.champion
    const loser = result.runnerUp
    const parts = [
        `En la final, ${winner.player.name} (${winner.team.name}) le ganó a ${
            loser.player.name
        } (${loser.team.name}) ${scoreText(
            final.winner === "p2" ? [...final.score].reverse() : final.score
        )}`,
    ]

    if (final.penalties) {
        parts.push(
            `en los penales (${scoreText(
                final.winner === "p2"
                    ? [...final.penalties.score].reverse()
                    : final.penalties.score
            )})`
        )
    } else if (final.aggregate) {
        parts.push(`con global ${scoreText(final.aggregate)}`)
    }
    if (final.decidedBy === "golden_goal") parts.push("con gol de oro")

    return makeFact("final_summary", 5, `${parts.join(" ")}.`, {
        matchIds: [final.matchId],
        data: { final },
    })
}

const upsetFacts = ({ entries }) => {
    const upsets = entries
        .filter(
            (entry) =>
                entry.valid &&
                // Con un lado provisorio (pocos partidos previos) las
                // probabilidades no son confiables: no es un batacazo.
                entry.p1.provisional !== true &&
                entry.p2.provisional !== true &&
                entry.upset === true &&
                entry.expectedWinner !== null &&
                entry.expectedWinner < UPSET_WINNER_EXPECTED_MAX
        )
        .sort((a, b) => a.expectedWinner - b.expectedWinner || a.seq - b.seq)
    const facts = []

    if (upsets.length === 0) return facts

    const biggest = upsets[0]
    const stageBoost = LATE_ROUNDS.includes(biggest.round) ? 5 : 4

    facts.push(
        makeFact(
            "biggest_upset",
            stageBoost,
            `El mayor batacazo: ${describeMatch(biggest)} ${winnerFirstScore(
                biggest
            )}; ${underdogText(biggest)}.`,
            {
                matchIds: [biggest.matchId],
                data: {
                    seq: biggest.seq,
                    stage: biggest.stage,
                    round: biggest.round,
                    winnerExpectedScore: round(biggest.expectedWinner, 3),
                    odds: biggest.odds,
                    score: biggest.score,
                    penalties: biggest.penalties,
                },
            }
        )
    )

    if (upsets.length >= 2) {
        facts.push(
            makeFact(
                "upsets",
                3,
                `Hubo ${upsets.length} partidos en los que ganó el menos favorito.`,
                {
                    matchIds: upsets.slice(0, 5).map(({ matchId }) => matchId),
                    data: {
                        count: upsets.length,
                        seqs: upsets.slice(0, 5).map(({ seq }) => seq),
                    },
                }
            )
        )
    }

    return facts
}

const playoffTeams = (entries) => {
    const teams = new Map()

    for (const entry of entries) {
        // Los `valid: false` no tienen overall (sin evento de rating) y taparían
        // al equipo si fueran su primera aparición.
        if (entry.stage === "regular" || !entry.valid) continue

        for (const side of [entry.p1, entry.p2]) {
            if (side.teamId !== null && !teams.has(String(side.teamId))) {
                teams.set(String(side.teamId), side)
            }
        }
    }

    return teams
}

const knockoutFacts = ({ ties, entries, result }) => {
    const facts = []
    const teams = playoffTeams(entries)
    const rated = [...teams.values()].filter(({ ovr }) => ovr !== null)

    // Favorito del cuadro (mayor overall) eliminado en las primeras rondas.
    const topSeed = uniqueMax(rated, ({ ovr }) => ovr)

    if (topSeed) {
        const exit = ties.find(
            (tie) =>
                EARLY_ROUNDS.includes(tie.round) &&
                tie.decidedBy !== "same_player_pick" &&
                tie.winnerIndex !== null &&
                tie.units.some(
                    ({ team }, index) =>
                        String(team.id) === String(topSeed.teamId) &&
                        index !== tie.winnerIndex
                )
        )

        if (exit) {
            const winner = exit.units[exit.winnerIndex]

            facts.push(
                makeFact(
                    "top_seed_early_exit",
                    3,
                    `${topSeed.team} (${
                        topSeed.player
                    }), el equipo de mayor overall del cuadro (${
                        topSeed.ovr
                    }), quedó afuera en ${roundText(exit.round)} ante ${
                        winner.team.name
                    } (${winner.player.name}).`,
                    {
                        data: {
                            team: topSeed.team,
                            player: topSeed.player,
                            ovr: topSeed.ovr,
                            round: exit.round,
                            eliminatedBy: winner.team.name,
                        },
                    }
                )
            )
        }
    }

    // Campeón o subcampeón con un equipo bastante más flojo que el promedio.
    if (rated.length > 0) {
        const average =
            rated.reduce((total, { ovr }) => total + ovr, 0) / rated.length

        for (const [role, finalist] of [
            ["champion", result.champion],
            ["runnerUp", result.runnerUp],
        ]) {
            const side = teams.get(String(finalist.team.id))

            if (!side || side.ovr === null) continue
            if (average - side.ovr < CINDERELLA_OVERALL_GAP) continue

            facts.push(
                makeFact(
                    "cinderella_run",
                    role === "champion" ? 4 : 3,
                    `${finalist.team.name} (${finalist.player.name}) llegó ${
                        role === "champion" ? "hasta el título" : "a la final"
                    } con un overall de ${side.ovr}, ${round(
                        average - side.ovr
                    )} puntos por debajo del promedio de los equipos del cuadro (${round(
                        average
                    )}).`,
                    {
                        suffix: role,
                        data: {
                            team: finalist.team.name,
                            ovr: side.ovr,
                            bracketAverageOvr: round(average),
                        },
                    }
                )
            )
        }
    }

    // Cruces a dos partidos que el ganador empezó perdiendo.
    for (const tie of ties) {
        if (!tie.aggregate || tie.winnerIndex === null) continue
        // Una pata `valid: false` (W.O. o mismo jugador) no es un resultado.
        if (tie.entries.some(({ valid }) => !valid)) continue

        const legOne =
            tie.entries.find((entry) => entry.leg === 1) ?? tie.entries[0]
        const winnerTeamId = String(tie.units[tie.winnerIndex].team.id)
        const lostFirst =
            legOne &&
            legOne.winner !== "draw" &&
            String(sideOfWinner(legOne).teamId) !== winnerTeamId

        if (!lostFirst) continue

        const winner = tie.units[tie.winnerIndex]
        const loser = tie.units[1 - tie.winnerIndex]

        facts.push(
            makeFact(
                "series_comeback",
                LATE_ROUNDS.includes(tie.round) ? 4 : 3,
                `${winner.team.name} (${
                    winner.player.name
                }) perdió el primer partido ante ${loser.team.name} (${
                    loser.player.name
                }) en ${roundText(
                    tie.round
                )} y aun así avanzó (global ${scoreText(tie.aggregate)}).`,
                {
                    suffix: String(tie.playoffId),
                    matchIds: tie.entries.map(({ matchId }) => matchId),
                    data: { round: tie.round, aggregate: tie.aggregate },
                }
            )
        )
    }

    // Goles de oro
    for (const tie of ties.filter(
        ({ decidedBy }) => decidedBy === "golden_goal"
    )) {
        const winner =
            tie.winnerIndex === null ? null : tie.units[tie.winnerIndex]

        if (!winner || tie.entries.some(({ valid }) => !valid)) continue

        facts.push(
            makeFact(
                "golden_goal_tiebreak",
                4,
                `${winner.team.name} (${
                    winner.player.name
                }) definió el cruce de ${roundText(
                    tie.round
                )} con el partido de desempate a gol de oro.`,
                {
                    suffix: String(tie.playoffId),
                    matchIds: tie.entries.map(({ matchId }) => matchId),
                    data: { round: tie.round },
                }
            )
        )
    }

    return facts
}

const penaltyFact = ({ entries }) => {
    const shootouts = entries.filter(
        (entry) => entry.valid && entry.penalties && entry.stage !== "regular"
    )

    if (shootouts.length === 0) return null

    const important = shootouts.some(({ round: r }) => LATE_ROUNDS.includes(r))
    const first = shootouts[shootouts.length - 1]

    return makeFact(
        "penalty_shootout",
        important ? 4 : 3,
        shootouts.length === 1
            ? `${describeMatch(first)} se definió por penales (${scoreText(
                  first.penalties.score
              )}).`
            : `Hubo ${shootouts.length} definiciones por penales en las eliminatorias.`,
        {
            matchIds: shootouts.slice(0, 5).map(({ matchId }) => matchId),
            data: {
                count: shootouts.length,
                seqs: shootouts.slice(0, 5).map(({ seq }) => seq),
            },
        }
    )
}

const lateQualificationFacts = ({ standings, ties }) => {
    if (!standings) return []

    const lateTeams = new Set(
        ties
            .filter(({ round: r }) => LATE_ROUNDS.includes(r))
            .flatMap(({ units }) => units.map(({ team }) => String(team.id)))
    )
    const facts = []

    for (const { group, teams } of standings.final) {
        for (const row of teams) {
            if (
                (row.qualification === "playin" ||
                    row.qualification === "best_third") &&
                lateTeams.has(String(row.teamId))
            ) {
                facts.push(
                    makeFact(
                        "late_qualification",
                        3,
                        `${row.team} (${
                            row.player
                        }) llegó a las semifinales después de clasificar ${
                            row.qualification === "playin"
                                ? "por el play-in"
                                : "como mejor tercero"
                        } (${row.position}° ${
                            group ? `del grupo ${group}` : "de la tabla"
                        }).`,
                        {
                            suffix: String(row.teamId),
                            data: {
                                team: row.team,
                                group,
                                position: row.position,
                                qualification: row.qualification,
                            },
                        }
                    )
                )
            }
        }
    }

    return facts
}

const standingsFacts = ({ standings, tournament, rules }) => {
    if (!standings) return []

    const facts = []
    const changes = Object.entries(standings.leaderChanges).filter(
        ([, count]) => count >= LEADER_CHANGES_MIN
    )

    if (changes.length > 0) {
        const [group, count] = changes.sort((a, b) => b[1] - a[1])[0]

        facts.push(
            makeFact(
                "leader_changes",
                3,
                `El liderato ${
                    group === "all" ? "de la tabla" : `del grupo ${group}`
                } cambió de manos ${count} veces a lo largo del torneo.`,
                { data: { byGroup: Object.fromEntries(changes) } }
            )
        )
    }

    if (rules.stages.includes("regular") && tournament.format !== "world_cup") {
        const finalLeaders = new Map(
            standings.final.map(({ group, teams }) => [group, teams[0]])
        )
        const close = standings.closeRace.filter((race) => {
            const finalLeader = finalLeaders.get(race.group)

            return (
                race.gapToSecond <= 3 ||
                (finalLeader &&
                    String(finalLeader.teamId) !== String(race.leaderTeamId))
            )
        })

        if (
            close.length > 0 &&
            standings.final.some(({ teams }) => teams.length >= 6)
        ) {
            const race = close[0]
            const finalLeader = finalLeaders.get(race.group)

            facts.push(
                makeFact(
                    "title_race_decided_on_last_matches",
                    3,
                    `La pelea por el primer puesto ${
                        race.group ? `del grupo ${race.group}` : "de la tabla"
                    } se definió sobre el final: ${
                        finalLeader.team
                    } terminó primero y a falta de solo ${
                        race.matchesLeft
                    } partidos ${
                        race.group ? "del grupo" : "de la tabla"
                    } la ventaja del líder de entonces sobre el segundo era de ${
                        race.gapToSecond
                    } puntos.`,
                    {
                        data: {
                            group: race.group,
                            matchesPlayed: race.matchesPlayed,
                            matchesLeft: race.matchesLeft,
                            leaderThen: race.leader,
                            gapToSecond: race.gapToSecond,
                            finalLeader: finalLeader.team,
                        },
                    }
                )
            )
        }
    }

    const rows = standings.final.flatMap(({ group, teams }) =>
        teams.map((row) => ({ ...row, groupName: group }))
    )
    const eligible = rows.filter(
        ({ played }) => played >= TEAM_STATS_MIN_MATCHES
    )
    const attack = uniqueMax(eligible, ({ gf }) => gf)
    const defence = uniqueMax(eligible, ({ ga }) => -ga)

    if (attack) {
        facts.push(
            makeFact(
                "best_attack",
                2,
                `El mejor ataque fue el de ${attack.team} (${attack.player}) con ${attack.gf} goles en ${attack.played} partidos.`,
                {
                    data: {
                        team: attack.team,
                        gf: attack.gf,
                        played: attack.played,
                    },
                }
            )
        )
    }
    if (defence) {
        facts.push(
            makeFact(
                "best_defence",
                2,
                `La mejor defensa fue la de ${defence.team} (${defence.player}) con ${defence.ga} goles en contra en ${defence.played} partidos.`,
                {
                    data: {
                        team: defence.team,
                        ga: defence.ga,
                        played: defence.played,
                    },
                }
            )
        )
    }

    return facts
}

const playerFacts = ({ playerStats, entries }) => {
    const facts = []
    const players = playerStats.players

    const streaks = [
        [
            "longest_win_streak",
            "bestWinStreak",
            LONG_WIN_STREAK_MIN,
            3,
            (n) => `${n} victorias consecutivas`,
        ],
        [
            "longest_unbeaten",
            "bestUnbeaten",
            LONG_UNBEATEN_MIN,
            2,
            (n) => `${n} partidos sin perder`,
        ],
        [
            "longest_losing_streak",
            "worstLosingStreak",
            LONG_LOSING_STREAK_MIN,
            2,
            (n) => `${n} derrotas consecutivas`,
        ],
    ]

    for (const [type, key, minimum, importance, describe] of streaks) {
        const best = uniqueMax(players, (player) => player[key].length)

        if (best && best[key].length >= minimum) {
            facts.push(
                makeFact(
                    type,
                    importance,
                    `${best.player.name} tuvo una racha de ${describe(
                        best[key].length
                    )}.`,
                    {
                        data: {
                            player: best.player.name,
                            length: best[key].length,
                            fromSeq: best[key].fromSeq,
                            toSeq: best[key].toSeq,
                        },
                    }
                )
            )
        }
    }

    const sheets = uniqueMax(players, ({ overall }) => overall.cleanSheets)

    if (sheets && sheets.overall.cleanSheets >= CLEAN_SHEETS_LEADER_MIN) {
        facts.push(
            makeFact(
                "clean_sheets_leader",
                2,
                `${sheets.player.name} fue quien más veces dejó el arco en cero: ${sheets.overall.cleanSheets} partidos.`,
                {
                    data: {
                        player: sheets.player.name,
                        cleanSheets: sheets.overall.cleanSheets,
                    },
                }
            )
        )
    }

    const over = uniqueMax(
        players.filter(({ overall }) => overall.expectedMatches > 0),
        ({ overall }) =>
            overall.actualPointsInRatedMatches - overall.expectedPoints
    )

    if (over) {
        const diff =
            over.overall.actualPointsInRatedMatches -
            over.overall.expectedPoints

        // Se informa en porcentaje (`performanceVsExpectedPct`): los puntos
        // crudos contra esperados no se entienden. Sin porcentaje (pocos
        // partidos con predicción) no se emite el hecho.
        if (
            diff >= STANDINGS_OVERPERFORMANCE_MIN_POINTS &&
            over.performanceVsExpectedPct !== null &&
            over.performanceVsExpectedPct !== undefined
        ) {
            facts.push(
                makeFact(
                    "standings_overperformance",
                    3,
                    `${over.player.name} rindió un ${over.performanceVsExpectedPct}% por encima de lo esperado según las predicciones del Elo.`,
                    {
                        data: {
                            player: over.player.name,
                            performanceVsExpectedPct:
                                over.performanceVsExpectedPct,
                            actual: over.overall.actualPointsInRatedMatches,
                            expected: over.overall.expectedPoints,
                        },
                    }
                )
            )
        }
    }

    const valid = entries.filter(
        (entry) => entry.valid && !entry.penalties && entry.winner !== "draw"
    )
    const biggest = uniqueMax(valid, ({ score }) =>
        Math.abs(score[0] - score[1])
    )

    if (
        biggest &&
        Math.abs(biggest.score[0] - biggest.score[1]) >= BIG_WIN_MARGIN
    ) {
        facts.push(
            makeFact(
                "biggest_win",
                3,
                `La mayor goleada: ${describeMatch(biggest)} ${winnerFirstScore(
                    biggest
                )}.`,
                {
                    matchIds: [biggest.matchId],
                    data: {
                        seq: biggest.seq,
                        score: biggest.score,
                        margin: Math.abs(biggest.score[0] - biggest.score[1]),
                        odds: biggest.odds,
                    },
                }
            )
        )
    }

    return facts
}

const ratingFacts = ({ ratingMovement }) => {
    const facts = []
    const byId = new Map(
        ratingMovement.players.map((entry) => [String(entry.player.id), entry])
    )
    const gainer = ratingMovement.biggestGainer
        ? byId.get(String(ratingMovement.biggestGainer.id))
        : null
    const loser = ratingMovement.biggestLoser
        ? byId.get(String(ratingMovement.biggestLoser.id))
        : null

    if (gainer && gainer.delta >= RATING_MOVE_MIN_DELTA) {
        facts.push(
            makeFact(
                "rating_biggest_gainer",
                3,
                `${gainer.player.name} fue quien más Elo ganó en el torneo: ${
                    gainer.delta > 0 ? "+" : ""
                }${
                    gainer.delta
                } (suma de los cambios de Elo de los partidos del torneo).`,
                {
                    data: {
                        player: gainer.player.name,
                        delta: gainer.delta,
                    },
                }
            )
        )
    }
    if (loser && loser.delta <= -RATING_MOVE_MIN_DELTA) {
        facts.push(
            makeFact(
                "rating_biggest_loser",
                2,
                `${loser.player.name} fue quien más Elo perdió en el torneo: ${loser.delta} (suma de los cambios de Elo de los partidos del torneo).`,
                {
                    data: {
                        player: loser.player.name,
                        delta: loser.delta,
                    },
                }
            )
        )
    }

    // Una sola mención por pareja, con el último adelantamiento.
    const lastByPair = new Map()
    for (const overtake of ratingMovement.overtakes) {
        lastByPair.set(`${overtake.player.id}|${overtake.passed.id}`, overtake)
    }
    const overtakes = [...lastByPair.values()].slice(0, 3)

    if (overtakes.length > 0) {
        facts.push(
            makeFact(
                "leaderboard_overtake",
                3,
                `Con los cambios de Elo de los partidos del torneo hubo adelantamientos en el ranking de Elo: ${overtakes
                    .map(
                        ({ player, passed }) =>
                            `${player.name} pasó a ${passed.name}`
                    )
                    .join("; ")}.`,
                {
                    matchIds: overtakes.map(({ atMatchId }) => atMatchId),
                    data: {
                        overtakes: overtakes.map(({ player, passed }) => ({
                            player: player.name,
                            passed: passed.name,
                        })),
                    },
                }
            )
        )
    }

    for (const entry of ratingMovement.players) {
        if (entry.leaderboard.isNewAllTimePeak) {
            facts.push(
                makeFact(
                    "new_peak_rating",
                    3,
                    `${entry.player.name} llegó a su máximo histórico de rating global (${entry.globalPeakRating}) en un partido del torneo. Es un dato del rating global: no es lo que ganó en este torneo.`,
                    {
                        suffix: String(entry.player.id),
                        data: {
                            player: entry.player.name,
                            globalPeakRating: entry.globalPeakRating,
                        },
                    }
                )
            )
        }
    }

    return facts
}

const headToHeadFact = ({ headToHead }) => {
    const final = headToHead.find(({ isFinal }) => isFinal)

    if (!final) return null

    const [a, b] = final.players
    const history = final.allTimeBefore
    const parts = [
        `${a.name} y ${b.name} se cruzaron ${final.inTournament.matches} veces en el torneo`,
    ]

    if (history && history.matches > 0) {
        parts.push(
            `antes del torneo el historial era ${history.aWins}-${history.draws}-${history.bWins} (victorias de ${a.name}, empates y victorias de ${b.name}) en ${history.matches} partidos`
        )
    }

    return makeFact("h2h_final", 3, `${parts.join("; ")}.`, {
        data: {
            players: [a.name, b.name],
            inTournament: final.inTournament,
            allTimeBefore: history,
        },
    })
}

// Lista priorizada de hechos ya detectados. El servidor decide qué es
// destacable; el modelo de lenguaje solo lo redacta. Pura y determinística:
// importancia descendente y, a igual importancia, por `id`.
const buildFacts = ({
    tournament,
    rules,
    result,
    standings,
    ties,
    championPath,
    entries,
    ratingMovement,
    playerStats,
    headToHead,
    titleContext,
}) => {
    const facts = [
        championPathFact({ result, championPath }),
        finalSummaryFact({ result }),
        titleMilestone({ titleContext, tournament }),
        ...upsetFacts({ entries }),
        ...knockoutFacts({ ties, entries, result }),
        penaltyFact({ entries }),
        ...lateQualificationFacts({ standings, ties }),
        ...standingsFacts({ standings, tournament, rules }),
        ...playerFacts({ playerStats, entries }),
        ...ratingFacts({ ratingMovement }),
        headToHeadFact({ headToHead }),
    ].filter(Boolean)

    return facts
        .sort((a, b) => b.importance - a.importance || (a.id < b.id ? -1 : 1))
        .slice(0, FACTS_MAX)
}

module.exports = { buildFacts }
