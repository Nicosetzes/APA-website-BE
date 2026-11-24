// Reinados en el #1 del Rating APA y posiciones del ranking partido a partido.
// Lo usan `GET /api/ratings/reigns` (reinados de toda la historia) y
// `GET /api/ratings/history` (posiciones para el gráfico y partidos en el #1
// del período).
//
// Reglas del #1 (el "líder"):
//   - Un jugador provisorio (menos de `provisionalMatches` partidos) no puede
//     ser #1. Sí cuenta para las posiciones del ranking, que son las de
//     `rankPlayers`.
//   - Mientras no hay líder, el #1 es quien queda solo arriba entre los no
//     provisorios. Si hay empate en la cima, no hay #1 todavía: el instante
//     inicial (todos en 1500) no cuenta como un #1 compartido.
//   - Con líder, empatarlo no lo destrona: sigue siendo #1 hasta que otro no
//     provisorio lo supera estrictamente. Si lo superan dos a la vez (no pasa
//     con un solo partido, pero se cubre), gana el de mayor rating y, ante
//     empate, el orden del ranking.
//   - Al arrancar desde una foto (`seed`, el ranking al inicio de un período)
//     no se sabe quién venía siendo #1: es el no provisorio de mayor rating y,
//     ante empate exacto, el primero en el orden del ranking.
//
// Un partido "en el #1" es un evento después del cual el jugador quedó como
// líder. El partido en que alguien llega al #1 cuenta para él; el partido en
// que lo superan cuenta para quien lo superó.
const { compareRanking } = require("./index")
const { describeParameters, displayName, toIso } = require("./presentation")

const isEligible = (player, provisionalMatches) =>
    player.matches >= provisionalMatches

// Líder al arrancar desde una foto: el no provisorio de mayor rating, con el
// orden del ranking como desempate.
const seedLeader = (players, provisionalMatches) => {
    const eligible = players
        .filter((player) => isEligible(player, provisionalMatches))
        .sort(compareRanking)
    return eligible[0]?.id ?? null
}

const nextLeader = (players, leaderId, provisionalMatches) => {
    const leader = leaderId === null ? null : players.get(leaderId)
    const threshold = leader ? leader.rating : -Infinity
    let best = null
    let tied = false
    for (const player of players.values()) {
        if (player.id === leaderId) continue
        if (!isEligible(player, provisionalMatches)) continue
        if (!(player.rating > threshold)) continue
        const order = best === null ? -1 : compareRanking(player, best)
        if (best === null || player.rating > best.rating) {
            best = player
            tied = false
        } else if (player.rating === best.rating) {
            tied = true
            if (order < 0) best = player
        }
    }
    if (best === null) return leaderId
    // Sin líder previo, un empate en la cima no corona a nadie.
    if (!leader && tied) return null
    return best.id
}

/**
 * Estado del ranking que avanza evento a evento. `seed` es el ranking al
 * arrancar (`rankPlayers`: `id`, `name`, `rating`, `matches`); vacío = desde el
 * principio de la historia. `apply(event)` aplica un evento del motor (o
 * guardado): `rating = before ± delta` y `matches = games + 1` de cada lado.
 */
const createLeadershipTracker = ({ provisionalMatches, seed = [] }) => {
    const players = new Map(
        seed.map((player) => [
            player.id,
            {
                id: player.id,
                name: player.name,
                rating: player.rating,
                matches: player.matches,
            },
        ])
    )
    let leaderId = seedLeader([...players.values()], provisionalMatches)
    return {
        leader: () => leaderId,
        player: (id) => players.get(id) ?? null,
        // Posición de cada jugador con partidos (Map id -> 1..N), con el mismo
        // orden que `rankPlayers`.
        positions: () =>
            new Map(
                [...players.values()]
                    .filter((player) => player.matches > 0)
                    .sort(compareRanking)
                    .map((player, index) => [player.id, index + 1])
            ),
        apply: (event) => {
            for (const [side, sign] of [
                [event.p1, 1],
                [event.p2, -1],
            ]) {
                players.set(side.id, {
                    id: side.id,
                    name: side.name,
                    rating: side.before + sign * event.delta,
                    matches: side.games + 1,
                })
            }
            leaderId = nextLeader(players, leaderId, provisionalMatches)
        },
    }
}

const toPlayer = (tracker, names, id) => {
    const player = tracker.player(id)
    return { id, name: displayName(names, player ?? { id, name: id }) }
}

const isCount = (value) => Number.isInteger(value) && value >= 0

// Equipo de un lado del evento (`{ id, name }`) o `null` si no hay ninguno de
// los dos datos. Solo viene si la lectura pidió los datos del historial.
const teamOf = (side) => {
    const name =
        typeof side?.team === "string" && side.team !== "" ? side.team : null
    const teamId = side?.teamId ?? null
    return name === null && teamId === null ? null : { id: teamId, name }
}

/**
 * Partido de un reinado, sin perspectiva (puede no involucrar al #1: lo
 * pueden superar mientras juegan otros). `penalties` es la tanda `{ p1, p2 }`
 * si el empate se definió por penales, o `null`.
 */
const toReignMatch = (event, names) => {
    if (!event) return null
    const side = (player, score) => ({
        id: player.id,
        name: displayName(names, player),
        team: teamOf(player),
        score,
    })
    return {
        matchId: event.matchId,
        date: toIso(event.time ?? null),
        datePrecision: event.playedAtPrecision ?? null,
        tournament: event.tournament ?? null,
        type: event.type ?? null,
        p1: side(event.p1, event.scoreP1),
        p2: side(event.p2, event.scoreP2),
        penalties:
            isCount(event.shootoutP1) && isCount(event.shootoutP2)
                ? { p1: event.shootoutP1, p2: event.shootoutP2 }
                : null,
    }
}

/**
 * Reinados en el #1 a partir de una foto inicial y los eventos posteriores
 * (ordenados por `seq` acá). Cada reinado:
 *   - `matches`: partidos APA (de cualquier jugador) en los que fue #1.
 *   - `startDate` / `startMatch`: el partido en que llegó al #1 (`null` si ya
 *     lo era en la foto inicial; la fecha también si el evento no tiene).
 *   - `endDate`: el partido en que lo superaron; si sigue, el último partido.
 *   - `lastMatch`: el último partido en que fue #1.
 *   - `breakMatch`: el partido en que lo superaron (`null` si sigue).
 *   - `isActive`, `dethronedBy` (`{ id, name }` o `null` si sigue).
 */
const findReigns = ({ seed = [], events, provisionalMatches, names }) => {
    const tracker = createLeadershipTracker({ provisionalMatches, seed })
    const reigns = []
    let current = null
    const open = (id, event) => {
        current = { id, matches: 0, start: event, last: null, cut: null }
        reigns.push(current)
    }
    if (tracker.leader() !== null) open(tracker.leader(), null)
    const sorted = [...events].sort((a, b) => a.seq - b.seq)
    for (const event of sorted) {
        const before = tracker.leader()
        tracker.apply(event)
        const after = tracker.leader()
        if (after !== before) {
            if (current) {
                current.cut = event
                current.dethronedBy = after
            }
            current = null
            if (after !== null) open(after, event)
        }
        if (current) {
            current.matches += 1
            current.last = event
        }
    }
    return reigns.map((reign) => {
        const isActive = reign === current
        const endEvent = isActive ? reign.last : reign.cut
        return {
            player: toPlayer(tracker, names, reign.id),
            matches: reign.matches,
            startDate: toIso(reign.start?.time ?? null),
            endDate: toIso(endEvent?.time ?? null),
            isActive,
            dethronedBy:
                !isActive && reign.dethronedBy
                    ? toPlayer(tracker, names, reign.dethronedBy)
                    : null,
            startMatch: toReignMatch(reign.start, names),
            lastMatch: toReignMatch(reign.last, names),
            breakMatch: isActive ? null : toReignMatch(reign.cut, names),
        }
    })
}

/**
 * Cuerpo de `GET /api/ratings/reigns`: todos los reinados en orden, el vigente
 * (`current`, o `null` si nadie es #1) y los más largos (`longest`: todos los
 * que empatan en partidos, en orden cronológico; vacío si no hubo reinados).
 */
const buildReignsPayload = ({
    previousRanking = [],
    periodEvents,
    config,
    names,
}) => {
    const reigns = findReigns({
        seed: previousRanking,
        events: periodEvents,
        provisionalMatches: config.provisionalMatches,
        names,
    })
    const longestMatches = reigns.reduce(
        (max, reign) => Math.max(max, reign.matches),
        0
    )
    return {
        success: true,
        parameters: describeParameters(config),
        data: {
            current: reigns.find((reign) => reign.isActive) ?? null,
            longest:
                longestMatches > 0
                    ? reigns.filter((reign) => reign.matches === longestMatches)
                    : [],
            reigns,
        },
    }
}

/**
 * Posiciones y partidos en el #1 de un período, para el historial. Arranca de
 * `seed` (el ranking al inicio del período) y aplica `events` (ya ordenados,
 * `x` = 1..N). Devuelve, para cada id de `ids`:
 *   - `positions`: los cambios de posición `[{ x, position }]`, empezando
 *     siempre por `x = 0` (`position: null` si todavía no debutó). Entre dos
 *     cambios la posición se mantiene.
 *   - `leaderMatches`: partidos del período después de los cuales fue #1.
 */
const trackPeriodPositions = ({ seed, events, provisionalMatches, ids }) => {
    const tracker = createLeadershipTracker({ provisionalMatches, seed })
    const positionsById = new Map(ids.map((id) => [id, []]))
    const leaderMatchesById = new Map(ids.map((id) => [id, 0]))
    const record = (x) => {
        const positions = tracker.positions()
        for (const [id, list] of positionsById) {
            const position = positions.get(id) ?? null
            const last = list[list.length - 1]
            if (!last || last.position !== position) list.push({ x, position })
        }
    }
    record(0)
    events.forEach((event, index) => {
        tracker.apply(event)
        record(index + 1)
        const leader = tracker.leader()
        if (leader !== null && leaderMatchesById.has(leader)) {
            leaderMatchesById.set(leader, leaderMatchesById.get(leader) + 1)
        }
    })
    return { positionsById, leaderMatchesById }
}

module.exports = {
    buildReignsPayload,
    createLeadershipTracker,
    findReigns,
    trackPeriodPositions,
}
