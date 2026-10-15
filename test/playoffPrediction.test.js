const assert = require("node:assert/strict")
const test = require("node:test")
const {
    calculatePlayerRatings,
    expectedForMatch,
    expectedScore,
} = require("../service/playerRatings")
const {
    buildPredictionIndex,
    decorateMatchesWithPrediction,
    isSingleLegTournament,
    predictMatch,
} = require("../service/playerRatings/prediction")
const {
    createTeamStrengthLookup,
} = require("../service/playerRatings/teamStrength")

const NICO = { id: "n", name: "Nico" }
const SANTI = { id: "s", name: "Santi" }
const LEO = { id: "l", name: "Leo" }
const TEAM_A = { id: 1, name: "Equipo A" }
const TEAM_B = { id: 2, name: "Equipo B" }
const TOURNAMENT = { id: "x", name: "Torneo" }

const OPTIONS = {
    initialRating: 1500,
    kFactor: 20,
    marginWeight: 0,
    teamStrengthWeight: 25,
    provisionalMatches: 3,
}
const teamStrength = createTeamStrengthLookup({
    editionByTournament: { x: "FC26" },
    overallByTeamEdition: { "1|FC26": 85, "2|FC26": 75 },
})
const WITH_TEAMS = { ...OPTIONS, teamStrength }
const WITHOUT_TEAMS = { ...OPTIONS, teamStrength: null }

let sequence = 0
const match = (playerP1, scoreP1, playerP2, scoreP2, playedAt, extra = {}) => ({
    _id: `m${String((sequence += 1)).padStart(4, "0")}`,
    playerP1,
    scoreP1,
    playerP2,
    scoreP2,
    teamP1: TEAM_A,
    teamP2: TEAM_B,
    tournament: TOURNAMENT,
    played: true,
    playedAt: new Date(playedAt),
    ...extra,
})
const pending = (playerP1, playerP2, extra = {}) => ({
    _id: `m${String((sequence += 1)).padStart(4, "0")}`,
    playerP1,
    scoreP1: null,
    playerP2,
    scoreP2: null,
    teamP1: TEAM_A,
    teamP2: TEAM_B,
    tournament: TOURNAMENT,
    played: false,
    ...extra,
})

// Historia donde Nico gana siempre: su rating actual se aleja de cualquier "before".
const history = () => [
    match(NICO, 2, SANTI, 0, "2026-01-01"),
    match(NICO, 1, SANTI, 0, "2026-01-02"),
    match(SANTI, 0, NICO, 3, "2026-01-03"),
    match(NICO, 2, LEO, 1, "2026-01-04"),
    match(LEO, 1, SANTI, 1, "2026-01-05"),
    match(NICO, 1, LEO, 0, "2026-01-06"),
]

const close = (actual, expected, tolerance = 1e-9) =>
    assert.ok(
        Math.abs(actual - expected) < tolerance,
        `${actual} no es ${expected}`
    )

test("expectedForMatch sin lookup o con peso 0 no aplica el equipo", () => {
    const config = { ...OPTIONS }
    const base = {
        rating1: 1600,
        rating2: 1500,
        match: match(NICO, 1, SANTI, 0, "2026-01-01"),
    }

    for (const variant of [
        { config, lookup: null },
        { config: { ...config, teamStrengthWeight: 0 }, lookup: teamStrength },
    ]) {
        const result = expectedForMatch({ ...base, ...variant })
        assert.equal(result.teamAdjustment, 0)
        assert.equal(result.teamOverall1, null)
        assert.equal(result.teamOverall2, null)
        assert.equal(result.expectedP1, expectedScore(1600, 1500, 400))
    }
})

test("expectedForMatch suma el término de equipo al rating efectivo", () => {
    const result = expectedForMatch({
        rating1: 1500,
        rating2: 1520,
        match: match(NICO, 1, SANTI, 0, "2026-01-01"),
        config: OPTIONS,
        lookup: teamStrength,
    })

    assert.equal(
        result.expectedP1,
        expectedScore(1500 + 25 * 85, 1520 + 25 * 75, 400)
    )
    assert.equal(result.teamAdjustment, 25 * (85 - 75))
    assert.equal(result.teamOverall1, 85)
    assert.equal(result.teamOverall2, 75)
})

test("expectedForMatch reproduce el expectedP1 de cada evento del motor", () => {
    for (const options of [WITH_TEAMS, WITHOUT_TEAMS]) {
        const { events, config } = calculatePlayerRatings(history(), options)
        assert.equal(events.length, 6)

        for (const event of events) {
            const result = expectedForMatch({
                rating1: event.p1.before,
                rating2: event.p2.before,
                match: {
                    tournament: TOURNAMENT,
                    teamP1: TEAM_A,
                    teamP2: TEAM_B,
                },
                config,
                lookup: options.teamStrength,
            })
            assert.equal(result.expectedP1, event.expectedP1)
            assert.equal(result.teamAdjustment, event.teamAdjustment)
        }
    }
})

test("un partido jugado usa el evento del motor, no los ratings actuales", () => {
    const matches = history()
    const played = matches[5]
    const index = buildPredictionIndex(matches, WITH_TEAMS)
    const event = index.eventsByMatchId.get(played._id)

    const prediction = predictMatch(played, index)

    assert.equal(prediction.basis, "pre_match")
    assert.equal(prediction.p1, Math.round(event.expectedP1 * 1000) / 1000)
    // El rating actual de Nico es otro: recalcular con él daría un valor distinto.
    const current = expectedForMatch({
        rating1: index.snapshot.get("n").rating,
        rating2: index.snapshot.get("l").rating,
        match: played,
        config: index.config,
        lookup: index.lookup,
    })
    assert.notEqual(Math.round(current.expectedP1 * 1000) / 1000, prediction.p1)
    assert.equal(prediction.ratingVersion, index.config.version)
})

test("un partido por jugar usa los ratings actuales", () => {
    const index = buildPredictionIndex(history(), WITH_TEAMS)
    const upcoming = pending(NICO, SANTI)

    const prediction = predictMatch(upcoming, index)
    const expected = expectedForMatch({
        rating1: index.snapshot.get("n").rating,
        rating2: index.snapshot.get("s").rating,
        match: upcoming,
        config: index.config,
        lookup: teamStrength,
    }).expectedP1

    assert.equal(prediction.basis, "current")
    assert.equal(prediction.p1, Math.round(expected * 1000) / 1000)
    assert.equal(prediction.teamAdjusted, true)
})

test("la predicción viva coincide con el evento una vez que se juega el partido", () => {
    const upcoming = pending(NICO, LEO)
    const before = predictMatch(
        upcoming,
        buildPredictionIndex(history(), WITH_TEAMS)
    )

    const played = {
        ...upcoming,
        played: true,
        scoreP1: 1,
        scoreP2: 0,
        playedAt: new Date("2026-02-01"),
    }
    const index = buildPredictionIndex([...history(), played], WITH_TEAMS)
    const event = index.eventsByMatchId.get(upcoming._id)

    assert.equal(before.p1, Math.round(event.expectedP1 * 1000) / 1000)
    assert.equal(predictMatch(played, index).p1, before.p1)
})

test("un jugador desconocido arranca en el rating inicial y es provisorio", () => {
    const index = buildPredictionIndex(history(), WITHOUT_TEAMS)
    const newcomer = { id: "nuevo", name: "Nuevo" }

    const prediction = predictMatch(pending(newcomer, LEO), index)
    const expected = expectedScore(1500, index.snapshot.get("l").rating, 400)

    assert.equal(prediction.provisional, true)
    assert.equal(prediction.p1, Math.round(expected * 1000) / 1000)
})

test("provisional es verdadero si alguno de los dos tiene pocos partidos", () => {
    // provisionalMatches = 3: Nico tiene 5 partidos y Leo 3 (ya no es provisorio).
    const index = buildPredictionIndex(history(), WITHOUT_TEAMS)
    assert.equal(index.snapshot.get("n").matches, 5)
    assert.equal(index.snapshot.get("l").matches, 3)
    assert.equal(predictMatch(pending(NICO, LEO), index).provisional, false)

    const short = buildPredictionIndex(
        [match(NICO, 1, SANTI, 0, "2026-01-01")],
        WITHOUT_TEAMS
    )
    assert.equal(predictMatch(pending(NICO, SANTI), short).provisional, true)

    // Uno solo con pocos partidos alcanza.
    const mixed = buildPredictionIndex(history(), WITHOUT_TEAMS)
    assert.equal(
        predictMatch(pending(NICO, { id: "z", name: "Zeta" }), mixed)
            .provisional,
        true
    )
})

test("provisional de un partido jugado sale de los partidos previos del evento", () => {
    const matches = history()
    const index = buildPredictionIndex(matches, WITHOUT_TEAMS)

    // El primer partido lo juegan dos jugadores con 0 partidos previos.
    assert.equal(predictMatch(matches[0], index).provisional, true)
    // El último: Nico con 4 previos y Leo con 2 previos (menos de 3).
    assert.equal(predictMatch(matches[5], index).provisional, true)
    // Después de sumar más partidos a Leo, ya no es provisorio.
    const more = [
        ...matches,
        match(LEO, 1, NICO, 0, "2026-01-07"),
        match(NICO, 1, LEO, 0, "2026-01-08"),
    ]
    const extended = buildPredictionIndex(more, WITHOUT_TEAMS)
    assert.equal(predictMatch(more[7], extended).provisional, false)
})

test("teamAdjusted refleja si se aplicó el término de equipo", () => {
    const matches = history()
    const played = matches[5]
    const upcoming = pending(NICO, SANTI)

    const withTeams = buildPredictionIndex(matches, WITH_TEAMS)
    assert.equal(predictMatch(played, withTeams).teamAdjusted, true)
    assert.equal(predictMatch(upcoming, withTeams).teamAdjusted, true)

    const without = buildPredictionIndex(matches, WITHOUT_TEAMS)
    assert.equal(predictMatch(played, without).teamAdjusted, false)
    assert.equal(predictMatch(upcoming, without).teamAdjusted, false)

    // Falta el overall de un equipo: se calcula como la 1.0.
    const missing = {
        ...upcoming,
        teamP2: { id: 99, name: "Sin overall" },
    }
    assert.equal(predictMatch(missing, withTeams).teamAdjusted, false)
})

test("devuelve null cuando falta un lado, es el mismo jugador o es inválido", () => {
    const matches = history()
    const index = buildPredictionIndex(matches, WITH_TEAMS)

    assert.equal(predictMatch(pending(NICO, null), index), null)
    assert.equal(predictMatch(pending(null, SANTI), index), null)
    assert.equal(
        predictMatch(pending(NICO, SANTI, { teamP2: null }), index),
        null
    )
    assert.equal(
        predictMatch(pending(NICO, SANTI, { teamP1: null }), index),
        null
    )
    assert.equal(predictMatch(pending(NICO, NICO), index), null)
    assert.equal(
        predictMatch(
            match(NICO, 1, { id: "n", name: "Otro" }, 0, "2026-03-01"),
            index
        ),
        null
    )
    // SIM / W.O.: jugado pero inválido, sin evento.
    assert.equal(
        predictMatch(
            match(NICO, 3, SANTI, 0, "2026-03-01", { valid: false }),
            index
        ),
        null
    )
    assert.equal(
        predictMatch(pending(NICO, SANTI, { valid: false }), index),
        null
    )
})

test("un partido jugado que el motor no pudo calificar no tiene predicción", () => {
    const index = buildPredictionIndex(history(), WITH_TEAMS)
    const noScore = match(NICO, null, SANTI, null, "2026-03-01")
    const fractional = match(NICO, 1.5, SANTI, 0, "2026-03-01")

    assert.equal(predictMatch(noScore, index), null)
    assert.equal(predictMatch(fractional, index), null)
})

test("p1 y p2 suman 1, están entre 0 y 1 y tienen 3 decimales como máximo", () => {
    const matches = history()
    const index = buildPredictionIndex(matches, WITH_TEAMS)
    const candidates = [
        ...matches,
        pending(NICO, SANTI),
        pending(SANTI, LEO),
        pending(LEO, NICO),
    ]

    for (const candidate of candidates) {
        const prediction = predictMatch(candidate, index)
        close(prediction.p1 + prediction.p2, 1)
        assert.ok(prediction.p1 >= 0 && prediction.p1 <= 1)
        assert.ok(prediction.p2 >= 0 && prediction.p2 <= 1)
        assert.equal(Math.round(prediction.p1 * 1000) / 1000, prediction.p1)
        assert.equal(Math.round(prediction.p2 * 1000) / 1000, prediction.p2)
    }
})

test("el lado invertido da la probabilidad complementaria", () => {
    const index = buildPredictionIndex(history(), WITHOUT_TEAMS)
    const direct = predictMatch(pending(NICO, SANTI), index)
    const reversed = predictMatch(
        pending(SANTI, NICO, { teamP1: TEAM_B, teamP2: TEAM_A }),
        index
    )

    close(direct.p1, reversed.p2, 1.5e-3)
})

test("isSingleLegTournament deja afuera la Champions y el playoff de dos piernas", () => {
    for (const tournament of [
        { format: "league_playin_playoff" },
        { format: "world_cup" },
        { format: "world_cup_2026" },
        { format: "super_cup" },
        { format: "playoff" },
        { format: "playoff", playoffMode: "single" },
        { format: "league" },
    ]) {
        assert.equal(isSingleLegTournament(tournament), true, tournament.format)
    }

    assert.equal(isSingleLegTournament({ format: "champions_league" }), false)
    assert.equal(
        isSingleLegTournament({ format: "playoff", playoffMode: "two_legged" }),
        false
    )
})

const createLogger = () => {
    const calls = []
    return { calls, warn: (event, fields) => calls.push({ event, fields }) }
}

test("decorateMatchesWithPrediction agrega prediction y conserva el resto", async () => {
    const all = history()
    const upcoming = pending(NICO, SANTI, { playoff_id: 3, extra: { a: 1 } })
    const played = all[5]
    const logger = createLogger()

    const result = await decorateMatchesWithPrediction({
        matches: [played, upcoming],
        tournament: { _id: "t", format: "world_cup_2026" },
        retrieveAllMatches: async () => all,
        logger,
        options: WITH_TEAMS,
    })

    assert.equal(result.length, 2)
    const { prediction: playedPrediction, ...playedRest } = result[0]
    const { prediction: upcomingPrediction, ...upcomingRest } = result[1]
    assert.deepEqual(playedRest, played)
    assert.deepEqual(upcomingRest, upcoming)
    assert.equal(playedPrediction.basis, "pre_match")
    assert.equal(upcomingPrediction.basis, "current")
    assert.equal(logger.calls.length, 0)
})

test("decorateMatchesWithPrediction no lee la base fuera de alcance ni sin partidos", async () => {
    let reads = 0
    const retrieveAllMatches = async () => {
        reads += 1
        return history()
    }
    const logger = createLogger()
    // Desempate (leg 3) de un playoff a dos piernas y play-in de la Champions.
    for (const [tournament, matches] of [
        [
            { format: "playoff", playoffMode: "two_legged" },
            [pending(NICO, SANTI, { type: "playoff", leg: 3 })],
        ],
        [
            { format: "champions_league" },
            [pending(NICO, SANTI, { type: "playin" })],
        ],
    ]) {
        const result = await decorateMatchesWithPrediction({
            matches,
            tournament,
            retrieveAllMatches,
            logger,
        })
        assert.equal(result[0].prediction, null)
        assert.equal(result[0]._id, matches[0]._id)
    }

    const empty = await decorateMatchesWithPrediction({
        matches: [],
        tournament: { format: "world_cup" },
        retrieveAllMatches,
        logger,
    })
    assert.deepEqual(empty, [])
    assert.equal(reads, 0)
    assert.equal(logger.calls.length, 0)
})

test("decorateMatchesWithPrediction cae a prediction null si la lectura falla", async () => {
    const logger = createLogger()
    const matches = [pending(NICO, SANTI), pending(SANTI, LEO)]

    const result = await decorateMatchesWithPrediction({
        matches,
        tournament: { _id: "t", format: "world_cup" },
        retrieveAllMatches: async () => {
            throw new Error("db caída")
        },
        logger,
    })

    assert.deepEqual(
        result.map((item) => item.prediction),
        [null, null]
    )
    assert.equal(logger.calls.length, 1)
    assert.equal(logger.calls[0].event, "match_predictions_unavailable")
    assert.equal(logger.calls[0].fields.message, "db caída")
})

test("decorateMatchesWithPrediction aplana documentos con toJSON", async () => {
    const upcoming = pending(NICO, SANTI)
    const document = {
        toJSON: () => ({ ...upcoming }),
        // Un spread de un documento real perdería estos campos.
        _doc: { ignored: true },
    }

    const result = await decorateMatchesWithPrediction({
        matches: [document],
        tournament: { format: "league_playin_playoff" },
        retrieveAllMatches: async () => history(),
        logger: createLogger(),
        options: WITH_TEAMS,
    })

    assert.equal(result[0]._id, upcoming._id)
    assert.equal(result[0].toJSON, undefined)
    assert.equal(result[0]._doc, undefined)
    assert.equal(result[0].prediction.basis, "current")
})
