/*
 * M2: backfill de `playedAt` / `playedAtPrecision` en los partidos jugados
 * (plan de normalización, ítem 5.3). Las excepciones viven en
 * data/played-at-overrides.json; este módulo sólo propone ops (plan puro).
 *
 * Precedencia de `proposePlayedAt`:
 *   0. no jugado -> sin propuesta;
 *   1. manualMatchDates con fecha;
 *   2. twoLeggedLeg1Repair: ida cuyo updatedAt quedó pegado al de su vuelta
 *      (P0) -> fecha propuesta de la vuelta menos offsetSeconds;
 *   3. grupos con matchIds;
 *   4. grupos por torneo (linearSpread / fixedInstant);
 *   5. era ObjectId (el partido se creaba al jugarse) -> ObjectId, exact;
 *   6. default -> updatedAt, exact (nunca pisa un playedAt existente).
 */

const { getFinalPlayoffId } = require("../../config/playoffFormats")
const { PLAYED_AT_PRECISIONS } = require("../../utils/playedAt")
const DEFAULT_OVERRIDES = require("./data/played-at-overrides.json")
const { applyOpsInMemory, describeUpdate } = require("./lib/memory")
const { COLLECTIONS } = require("./lib/snapshot")

const ID = "001-m2-played-at"
const MATCHES = COLLECTIONS.matches

const STRATEGIES = new Set(["linearSpread", "fixedInstant", "objectIdInstant"])

// Claves de grupo con checks propios (si el grupo no está, el check se omite).
const GROUP_KEYS = Object.freeze({
    argentino: "torneo-argentino-2021-22",
    chempions: "chempions-2019-20",
    italo: "italo-espanola-fixture-import",
    worldCupGroups: "copa-del-mundo-2022-grupos",
    sliPostman: "sli-2022-postman-reentry",
})
// Días (UTC) en que se volvieron a cargar con Postman los partidos de la SLI
// 2022: 17 el 2023-05-11 y uno más (645fa72936fe5e01f176a87c) el 2023-05-13.
const POSTMAN_REENTRY_DAYS = Object.freeze(["2023-05-11", "2023-05-13"])

const LEVELS = Object.freeze({
    manual: 1,
    twoLegged: 2,
    matchGroup: 3,
    tournamentGroup: 4,
    objectIdEra: 5,
    default: 6,
})
const OP_GROUPS = Object.freeze({
    manual: "manual-match-dates",
    twoLegged: "two-legged-leg1-repair",
    objectIdEra: "objectid-era",
    default: "default",
})

const BATCH_MIN_RUN = 5
const BATCH_MAX_GAP_MS = 5 * 60 * 1000
const LATE_GAP_MS = 30 * 24 * 60 * 60 * 1000

const idKey = (value) =>
    value === null || value === undefined ? null : String(value)

const tournamentKey = (match) => idKey(match?.tournament?.id)

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const objectIdTime = (id) => {
    if (typeof id?.getTimestamp === "function") {
        return id.getTimestamp().getTime()
    }
    const hex = String(id ?? "")
    return /^[0-9a-f]{24}$/i.test(hex)
        ? parseInt(hex.substring(0, 8), 16) * 1000
        : null
}

const iso = (time) => (time === null ? null : new Date(time).toISOString())

const compareIdAsc = (a, b) => {
    const left = String(a._id)
    const right = String(b._id)
    if (left === right) return 0
    return left < right ? -1 : 1
}

const isLeg1 = (match) => Number(match?.leg) === 1
const isLaterLeg = (match) => [2, 3].includes(Number(match?.leg))

const isFinalMatch = (match, format) =>
    match.type === "playoff" &&
    Number(match.playoff_id) === getFinalPlayoffId(format) &&
    (match.leg === undefined || match.leg === null || isLeg1(match))

const minOf = (values) => {
    const list = values.filter((value) => value !== null)
    return list.length ? Math.min(...list) : null
}
const maxOf = (values) => {
    const list = values.filter((value) => value !== null)
    return list.length ? Math.max(...list) : null
}

const isPrecision = (value) => PLAYED_AT_PRECISIONS.includes(value)

const validateOverrides = (overrides) => {
    const problems = []
    const push = (problem) => problems.push(problem)

    if (!overrides || overrides.version !== 1) push("version debe ser 1")
    const groups = Array.isArray(overrides?.groups) ? overrides.groups : []
    if (!Array.isArray(overrides?.groups)) push("falta groups")

    const keys = new Set()
    const listed = new Set()
    const groupedTournaments = new Set()
    groups.forEach((group, index) => {
        const label = group?.key || `#${index}`
        if (typeof group?.key !== "string" || !group.key) {
            push(`grupo ${label}: falta key`)
        }
        if (keys.has(group?.key)) push(`grupo ${label}: key repetida`)
        keys.add(group?.key)
        if (typeof group?.tournamentId !== "string") {
            push(`grupo ${label}: falta tournamentId`)
        }
        if (!STRATEGIES.has(group?.strategy)) {
            push(`grupo ${label}: estrategia desconocida`)
        }
        if (!Number.isInteger(group?.expectedCount)) {
            push(`grupo ${label}: falta expectedCount`)
        }
        if (group?.strategy === "linearSpread") {
            if (Array.isArray(group.matchIds)) {
                push(`grupo ${label}: linearSpread es por torneo`)
            }
            if (toTime(group.from) === null || toTime(group.to) === null) {
                push(`grupo ${label}: from/to inválidos`)
            } else if (toTime(group.from) > toTime(group.to)) {
                push(`grupo ${label}: from > to`)
            }
            ;["firstPrecision", "middlePrecision", "lastPrecision"].forEach(
                (field) => {
                    if (!isPrecision(group[field])) {
                        push(`grupo ${label}: ${field} inválida`)
                    }
                }
            )
        } else if (!isPrecision(group?.precision)) {
            push(`grupo ${label}: precision inválida`)
        }
        if (group?.strategy === "fixedInstant" && toTime(group.at) === null) {
            push(`grupo ${label}: at inválido`)
        }
        if (group?.strategy === "objectIdInstant") {
            if (!Array.isArray(group.matchIds)) {
                push(`grupo ${label}: objectIdInstant requiere matchIds`)
            }
        }
        if (Array.isArray(group?.matchIds)) {
            group.matchIds.forEach((id) => {
                if (listed.has(id)) push(`grupo ${label}: id repetido ${id}`)
                listed.add(id)
            })
        } else if (group?.tournamentId) {
            if (groupedTournaments.has(group.tournamentId)) {
                push(`grupo ${label}: torneo con dos grupos por torneo`)
            }
            groupedTournaments.add(group.tournamentId)
        }
    })

    const repair = overrides?.twoLeggedLeg1Repair
    if (repair) {
        if (!Array.isArray(repair.tournamentIds)) {
            push("twoLeggedLeg1Repair: falta tournamentIds")
        } else if (
            repair.tournamentIds.some((id) => groupedTournaments.has(id))
        ) {
            push("twoLeggedLeg1Repair: torneo también en un grupo por torneo")
        }
        if (!(repair.maxGapSeconds >= 0) || !(repair.offsetSeconds >= 0)) {
            push("twoLeggedLeg1Repair: maxGapSeconds/offsetSeconds inválidos")
        }
        if (!isPrecision(repair.precision)) {
            push("twoLeggedLeg1Repair: precision inválida")
        }
    }

    const manualIds = new Set()
    const manual = overrides?.manualMatchDates
    if (manual !== undefined && !Array.isArray(manual)) {
        push("manualMatchDates debe ser un array")
    }
    ;(Array.isArray(manual) ? manual : []).forEach((entry, index) => {
        const label = entry?.matchId || `#${index}`
        if (typeof entry?.matchId !== "string" || !entry.matchId) {
            push(`manualMatchDates ${label}: falta matchId`)
        }
        if (manualIds.has(entry?.matchId)) {
            push(`manualMatchDates ${label}: repetido`)
        }
        manualIds.add(entry?.matchId)
        if (entry?.playedAt !== null && toTime(entry?.playedAt) === null) {
            push(`manualMatchDates ${label}: playedAt inválido`)
        }
        if (entry?.playedAt !== null && !isPrecision(entry?.precision)) {
            push(`manualMatchDates ${label}: precision inválida`)
        }
    })

    // Lo usa 003-m3-tournament-dates; se valida acá porque vive en el mismo
    // archivo de overrides.
    const closedAt = overrides?.tournamentClosedAt
    if (closedAt !== undefined && !Array.isArray(closedAt)) {
        push("tournamentClosedAt debe ser un array")
    }
    const closedTournaments = new Set()
    ;(Array.isArray(closedAt) ? closedAt : []).forEach((entry, index) => {
        const label = entry?.tournamentId || `#${index}`
        if (typeof entry?.tournamentId !== "string" || !entry.tournamentId) {
            push(`tournamentClosedAt ${label}: falta tournamentId`)
        }
        if (typeof entry?.matchId !== "string" || !entry.matchId) {
            push(`tournamentClosedAt ${label}: falta matchId`)
        }
        if (closedTournaments.has(entry?.tournamentId)) {
            push(`tournamentClosedAt ${label}: repetido`)
        }
        closedTournaments.add(entry?.tournamentId)
    })

    return problems
}

const linearSpreadTimes = (group, members) => {
    const from = toTime(group.from)
    const to = toTime(group.to)
    const n = members.length
    return members.map((member, index) => {
        // Segundos enteros, determinístico por orden de _id.
        const offset =
            n > 1 ? Math.round(((to - from) * index) / (n - 1) / 1000) : 0
        const precision =
            index === 0
                ? group.firstPrecision
                : index === n - 1
                ? group.lastPrecision
                : group.middlePrecision
        return [idKey(member._id), { time: from + offset * 1000, precision }]
    })
}

const buildContext = (snapshot, overrides) => {
    const matchesById = new Map()
    const byTournament = new Map()
    snapshot.matches.forEach((match) => {
        matchesById.set(idKey(match._id), match)
        const key = tournamentKey(match)
        if (!byTournament.has(key)) byTournament.set(key, [])
        byTournament.get(key).push(match)
    })

    const manual = new Map()
    ;(overrides.manualMatchDates || []).forEach((entry) => {
        if (entry.playedAt === null) return
        manual.set(entry.matchId, {
            time: toTime(entry.playedAt),
            precision: entry.precision,
        })
    })

    const matchGroups = new Map()
    const tournamentGroups = new Map()
    overrides.groups.forEach((group) => {
        if (Array.isArray(group.matchIds)) {
            group.matchIds.forEach((id) => matchGroups.set(id, group))
        } else {
            tournamentGroups.set(group.tournamentId, group)
        }
    })

    const repair = overrides.twoLeggedLeg1Repair
    const twoLegged = repair
        ? {
              tournamentIds: new Set(repair.tournamentIds),
              maxGapMs: repair.maxGapSeconds * 1000,
              offsetMs: repair.offsetSeconds * 1000,
              precision: repair.precision,
          }
        : null

    // Miembros de los grupos por torneo: jugados que no cayeron en 1 ni 3.
    const spread = new Map()
    const tournamentGroupMembers = new Map()
    tournamentGroups.forEach((group, tournamentId) => {
        const members = (byTournament.get(tournamentId) || [])
            .filter(
                (match) =>
                    match.played === true &&
                    !manual.has(idKey(match._id)) &&
                    !matchGroups.has(idKey(match._id))
            )
            .sort(compareIdAsc)
        tournamentGroupMembers.set(
            tournamentId,
            new Set(members.map((match) => idKey(match._id)))
        )
        if (group.strategy === "linearSpread") {
            linearSpreadTimes(group, members).forEach(([id, value]) =>
                spread.set(id, value)
            )
        }
    })

    const era = overrides.objectIdEra || {}
    return {
        overrides,
        matchesById,
        byTournament,
        manual,
        matchGroups,
        tournamentGroups,
        tournamentGroupMembers,
        spread,
        twoLegged,
        objectIdAll: new Set(era.allMatchesTournamentIds || []),
        objectIdKnockouts: new Set(era.knockoutOnlyTournamentIds || []),
        cache: new Map(),
    }
}

// Vueltas jugadas de la misma llave cuyo updatedAt quedó a <= maxGap de la ida.
const stuckSiblings = (match, ctx) => {
    const twoLegged = ctx.twoLegged
    const tournamentId = tournamentKey(match)
    if (!twoLegged || !twoLegged.tournamentIds.has(tournamentId)) return []
    if (match.played !== true || !isLeg1(match)) return []
    const updatedAt = toTime(match.updatedAt)
    if (updatedAt === null) return []

    return (ctx.byTournament.get(tournamentId) || []).filter(
        (sibling) =>
            sibling !== match &&
            sibling.played === true &&
            sibling.type === match.type &&
            String(sibling.playoff_id) === String(match.playoff_id) &&
            isLaterLeg(sibling) &&
            toTime(sibling.updatedAt) !== null &&
            Math.abs(toTime(sibling.updatedAt) - updatedAt) <=
                twoLegged.maxGapMs
    )
}

const computeProposal = (match, ctx) => {
    const id = idKey(match._id)

    if (ctx.manual.has(id)) {
        const entry = ctx.manual.get(id)
        return {
            ...entry,
            level: LEVELS.manual,
            group: OP_GROUPS.manual,
            rule: "manualMatchDates",
        }
    }

    // Nunca pisa un playedAt exacto que ya cargó el writer de M1.
    const twoLegged = ctx.twoLegged
    if (
        twoLegged &&
        (match.playedAt === undefined ||
            match.playedAtPrecision === twoLegged.precision)
    ) {
        const candidates = stuckSiblings(match, ctx)
            .map((sibling) => ({
                sibling,
                proposal: proposePlayedAt(sibling, ctx),
            }))
            .filter(({ proposal }) => proposal && proposal.time !== null)
            .sort((a, b) => a.proposal.time - b.proposal.time)
        if (candidates.length) {
            const { sibling, proposal } = candidates[0]
            return {
                time: proposal.time - twoLegged.offsetMs,
                precision: twoLegged.precision,
                level: LEVELS.twoLegged,
                group: OP_GROUPS.twoLegged,
                rule: `twoLeggedLeg1Repair (vuelta ${idKey(sibling._id)})`,
                siblingId: idKey(sibling._id),
            }
        }
    }

    const matchGroup = ctx.matchGroups.get(id)
    if (matchGroup) {
        const time =
            matchGroup.strategy === "objectIdInstant"
                ? objectIdTime(match._id)
                : toTime(matchGroup.at)
        return {
            time,
            precision: matchGroup.precision,
            level: LEVELS.matchGroup,
            group: matchGroup.key,
            rule: matchGroup.strategy,
        }
    }

    const tournamentId = tournamentKey(match)
    const tournamentGroup = ctx.tournamentGroups.get(tournamentId)
    if (
        tournamentGroup &&
        ctx.tournamentGroupMembers.get(tournamentId)?.has(id)
    ) {
        const base = {
            level: LEVELS.tournamentGroup,
            group: tournamentGroup.key,
            rule: tournamentGroup.strategy,
        }
        if (tournamentGroup.strategy === "linearSpread") {
            return { ...base, ...ctx.spread.get(id) }
        }
        return {
            ...base,
            time: toTime(tournamentGroup.at),
            precision: tournamentGroup.precision,
        }
    }

    if (
        ctx.objectIdAll.has(tournamentId) ||
        (ctx.objectIdKnockouts.has(tournamentId) && match.type !== "regular")
    ) {
        return {
            time: objectIdTime(match._id),
            precision: "exact",
            level: LEVELS.objectIdEra,
            group: OP_GROUPS.objectIdEra,
            rule: "objectId",
        }
    }

    return {
        time: toTime(match.updatedAt),
        precision: "exact",
        level: LEVELS.default,
        group: OP_GROUPS.default,
        rule: "updatedAt",
    }
}

const proposePlayedAt = (match, ctx) => {
    if (match?.played !== true) return null
    const id = idKey(match._id)
    if (!ctx.cache.has(id)) ctx.cache.set(id, computeProposal(match, ctx))
    return ctx.cache.get(id)
}

const buildOp = (match, proposal) => {
    const value = new Date(proposal.time)
    const hasPlayedAt = match.playedAt !== undefined
    const exception = proposal.level < LEVELS.default

    if (exception) {
        const same =
            hasPlayedAt &&
            toTime(match.playedAt) === proposal.time &&
            match.playedAtPrecision === proposal.precision
        if (same) return null
    } else if (hasPlayedAt) {
        return null
    }

    const update = {
        $set: { playedAt: value, playedAtPrecision: proposal.precision },
    }
    const filter = exception
        ? {
              _id: match._id,
              played: true,
              $or: [
                  { playedAt: { $exists: false } },
                  { playedAt: { $ne: value } },
                  { playedAtPrecision: { $ne: proposal.precision } },
              ],
          }
        : { _id: match._id, played: true, playedAt: { $exists: false } }

    return {
        collection: MATCHES,
        _id: match._id,
        filter,
        update,
        group: proposal.group,
        rule: proposal.rule,
        ...describeUpdate(match, update),
    }
}

const check = (name, ok, detail = "") => ({ name, ok: Boolean(ok), detail })

const listDetail = (label, ids) =>
    ids.length
        ? `${label}: ${ids.slice(0, 20).join(", ")}${
              ids.length > 20 ? ` (+${ids.length - 20})` : ""
          }`
        : ""

const groupChecks = ({ overrides, ctx, proposals, played }) => {
    const checks = []
    const membersOf = (key) =>
        played.filter((match) => proposals.get(idKey(match._id)).group === key)
    const groupByKey = new Map(
        overrides.groups.map((group) => [group.key, group])
    )
    const proposalTime = (match) => proposals.get(idKey(match._id))?.time

    overrides.groups.forEach((group) => {
        const members = membersOf(group.key)
        checks.push(
            check(
                `grupo ${group.key}: ${group.expectedCount} partidos`,
                members.length === group.expectedCount,
                `propuestos ${members.length}`
            )
        )
        if (!Array.isArray(group.matchIds)) return

        const missing = []
        const unplayed = []
        const otherTournament = []
        group.matchIds.forEach((id) => {
            const match = ctx.matchesById.get(id)
            if (!match) missing.push(id)
            else if (match.played !== true) unplayed.push(id)
            else if (tournamentKey(match) !== group.tournamentId) {
                otherTournament.push(id)
            }
        })
        checks.push(
            check(
                `grupo ${group.key}: ids existentes, jugados y del torneo`,
                !missing.length && !unplayed.length && !otherTournament.length,
                [
                    listDetail("no existen", missing),
                    listDetail("no jugados", unplayed),
                    listDetail("de otro torneo", otherTournament),
                ]
                    .filter(Boolean)
                    .join("; ")
            )
        )
    })

    const tournamentPlayed = (tournamentId) =>
        played.filter((match) => tournamentKey(match) === tournamentId)

    const italo = groupByKey.get(GROUP_KEYS.italo)
    if (italo) {
        const fixtureTime = toTime(italo.fixtureInstant)
        const members = membersOf(italo.key)
        const memberIds = new Set(members.map((match) => idKey(match._id)))
        const others = tournamentPlayed(italo.tournamentId).filter(
            (match) => !memberIds.has(idKey(match._id))
        )
        const wrong = members
            .filter((match) => toTime(match.updatedAt) !== fixtureTime)
            .map((match) => idKey(match._id))
        const leftover = others
            .filter((match) => toTime(match.updatedAt) === fixtureTime)
            .map((match) => idKey(match._id))
        checks.push(
            check(
                `${italo.key}: updatedAt == fixtureInstant sólo en el grupo`,
                !wrong.length && !leftover.length,
                [
                    listDetail("del grupo con otro updatedAt", wrong),
                    listDetail("fuera del grupo con fixtureInstant", leftover),
                ]
                    .filter(Boolean)
                    .join("; ")
            )
        )
        const restMin = minOf(others.map(proposalTime))
        checks.push(
            check(
                `${italo.key}: anterior al resto del torneo`,
                restMin === null || toTime(italo.at) < restMin,
                `resto desde ${iso(restMin)}`
            )
        )
    }

    const worldCup = groupByKey.get(GROUP_KEYS.worldCupGroups)
    if (worldCup) {
        const all = ctx.byTournament.get(worldCup.tournamentId) || []
        const listed = new Set(worldCup.matchIds || [])
        const regular = all.filter((match) => match.type === "regular")
        const notListed = regular
            .filter((match) => !listed.has(idKey(match._id)))
            .map((match) => idKey(match._id))
        const notRegular = all
            .filter(
                (match) =>
                    listed.has(idKey(match._id)) && match.type !== "regular"
            )
            .map((match) => idKey(match._id))
        checks.push(
            check(
                `${worldCup.key}: son todos los regular del torneo`,
                !notListed.length && !notRegular.length,
                [
                    listDetail("regular fuera del grupo", notListed),
                    listDetail("no regular en el grupo", notRegular),
                ]
                    .filter(Boolean)
                    .join("; ")
            )
        )
        const groupsMax = maxOf(regular.map((match) => objectIdTime(match._id)))
        const knockoutsMin = minOf(
            all
                .filter((match) => match.type !== "regular")
                .map((match) => objectIdTime(match._id))
        )
        checks.push(
            check(
                `${worldCup.key}: grupos anteriores a los knockouts`,
                groupsMax === null ||
                    knockoutsMin === null ||
                    groupsMax < knockoutsMin,
                `grupos hasta ${iso(groupsMax)}, knockouts desde ${iso(
                    knockoutsMin
                )}`
            )
        )
    }

    const postman = groupByKey.get(GROUP_KEYS.sliPostman)
    if (postman) {
        const listed = new Set(postman.matchIds || [])
        const all = ctx.byTournament.get(postman.tournamentId) || []
        const wrong = all
            .filter(
                (match) =>
                    listed.has(idKey(match._id)) &&
                    (match.type !== "regular" ||
                        !POSTMAN_REENTRY_DAYS.includes(
                            iso(objectIdTime(match._id)).slice(0, 10)
                        ))
            )
            .map((match) => idKey(match._id))
        checks.push(
            check(
                `${
                    postman.key
                }: regulares creados el ${POSTMAN_REENTRY_DAYS.join(" o el ")}`,
                !wrong.length,
                listDetail("no cumplen", wrong)
            )
        )
        const restMin = minOf(
            all
                .filter((match) => !listed.has(idKey(match._id)))
                .map((match) => objectIdTime(match._id))
        )
        checks.push(
            check(
                `${postman.key}: fecha anterior al primer ObjectId del resto`,
                restMin === null || toTime(postman.at) < restMin,
                `resto desde ${iso(restMin)}`
            )
        )
    }

    const argentino = groupByKey.get(GROUP_KEYS.argentino)
    if (argentino) {
        const members = membersOf(argentino.key).sort(compareIdAsc)
        const decreasing = members
            .filter(
                (match, index) =>
                    index > 0 &&
                    proposalTime(match) < proposalTime(members[index - 1])
            )
            .map((match) => idKey(match._id))
        checks.push(
            check(
                `${argentino.key}: fechas no decrecientes por _id`,
                !decreasing.length,
                listDetail("decrecen", decreasing)
            )
        )
        const argentinoMax = maxOf(members.map(proposalTime))
        const eraMin = minOf(
            (overrides.objectIdEra?.allMatchesTournamentIds || []).flatMap(
                (tournamentId) =>
                    tournamentPlayed(tournamentId).map(proposalTime)
            )
        )
        checks.push(
            check(
                `${argentino.key}: anterior a la era ObjectId`,
                argentinoMax === null ||
                    eraMin === null ||
                    argentinoMax < eraMin,
                `hasta ${iso(argentinoMax)}, era ObjectId desde ${iso(eraMin)}`
            )
        )

        const chempions = groupByKey.get(GROUP_KEYS.chempions)
        if (chempions) {
            const chempionsMax = maxOf(
                membersOf(chempions.key).map(proposalTime)
            )
            const argentinoMin = minOf(members.map(proposalTime))
            checks.push(
                check(
                    `${chempions.key}: anterior al ${argentino.key}`,
                    chempionsMax === null ||
                        argentinoMin === null ||
                        chempionsMax < argentinoMin,
                    `hasta ${iso(chempionsMax)}`
                )
            )
        }
    }

    return checks
}

const manualChecks = ({ overrides, ctx, proposals }) => {
    const entries = (overrides.manualMatchDates || []).filter(
        (entry) => entry.playedAt !== null
    )
    const invalid = entries
        .filter((entry) => ctx.matchesById.get(entry.matchId)?.played !== true)
        .map((entry) => entry.matchId)

    const notBefore = []
    const evidence = entries.map((entry) => {
        const match = ctx.matchesById.get(entry.matchId)
        if (!match) return { matchId: entry.matchId, found: false }
        const laterLegs = isLeg1(match)
            ? (ctx.byTournament.get(tournamentKey(match)) || []).filter(
                  (other) =>
                      other !== match &&
                      other.played === true &&
                      other.type === match.type &&
                      String(other.playoff_id) === String(match.playoff_id) &&
                      isLaterLeg(other)
              )
            : []
        const time = toTime(entry.playedAt)
        laterLegs.forEach((other) => {
            const otherTime = proposals.get(idKey(other._id))?.time
            if (otherTime !== undefined && !(time < otherTime)) {
                notBefore.push(entry.matchId)
            }
        })
        return {
            matchId: entry.matchId,
            found: true,
            tournamentId: tournamentKey(match),
            type: match.type,
            playoff_id: match.playoff_id,
            leg: match.leg,
            played: match.played,
            scoreP1: match.scoreP1,
            scoreP2: match.scoreP2,
            teamP1Id: match.teamP1?.id,
            teamP2Id: match.teamP2?.id,
            playedAt: entry.playedAt,
            precision: entry.precision,
            laterLegs: laterLegs.map((other) => ({
                matchId: idKey(other._id),
                leg: other.leg,
                updatedAt: iso(toTime(other.updatedAt)),
                proposedPlayedAt: iso(
                    proposals.get(idKey(other._id))?.time ?? null
                ),
            })),
        }
    })

    return {
        checks: [
            check(
                "manualMatchDates: partidos existentes y jugados",
                !invalid.length,
                listDetail("no existen o no están jugados", invalid)
            ),
            check(
                "manualMatchDates: cada ida es anterior a su vuelta",
                !notBefore.length,
                listDetail("no anteriores", [...new Set(notBefore)])
            ),
        ],
        evidence,
    }
}

const detectBatches = ({ played, proposals, tournamentName }) => {
    const byTournament = new Map()
    played.forEach((match) => {
        const proposal = proposals.get(idKey(match._id))
        if (proposal.level < LEVELS.objectIdEra || proposal.time === null) {
            return
        }
        const key = tournamentKey(match)
        if (!byTournament.has(key)) byTournament.set(key, [])
        byTournament.get(key).push({ match, time: proposal.time })
    })

    const items = []
    byTournament.forEach((entries, tournamentId) => {
        entries.sort(
            (a, b) => a.time - b.time || compareIdAsc(a.match, b.match)
        )
        let run = []
        const flush = () => {
            if (run.length >= BATCH_MIN_RUN) {
                items.push({
                    kind: "batch",
                    ids: run.map((entry) => idKey(entry.match._id)),
                    detail: `${tournamentName(tournamentId)}: ${
                        run.length
                    } resultados entre ${iso(run[0].time)} y ${iso(
                        run[run.length - 1].time
                    )} con menos de 5 min entre sí`,
                    suggestion:
                        "si se cargaron en tanda después de jugarse, fijar sus fechas en manualMatchDates; si no, no hace falta nada",
                })
            }
            run = []
        }
        entries.forEach((entry) => {
            const previous = run[run.length - 1]
            if (previous && entry.time - previous.time >= BATCH_MAX_GAP_MS) {
                flush()
            }
            run.push(entry)
        })
        flush()
    })
    return items
}

const detectLateAdditions = ({ snapshot, ctx, proposals, tournamentName }) => {
    const items = []
    snapshot.tournaments
        .filter(
            (tournament) =>
                tournament.ongoing === false && tournament.legacy !== true
        )
        .forEach((tournament) => {
            const tournamentId = idKey(tournament._id)
            const played = (ctx.byTournament.get(tournamentId) || []).filter(
                (match) => match.played === true
            )
            const final = played.find((match) =>
                isFinalMatch(match, tournament.format)
            )
            const finalTime = final
                ? proposals.get(idKey(final._id))?.time ?? null
                : null
            const candidates = played
                .filter(
                    (match) =>
                        proposals.get(idKey(match._id)).level >=
                        LEVELS.objectIdEra
                )
                .sort(compareIdAsc)

            // El salto de >30 días sólo es evidencia en la era ObjectId: con
            // fixture, las rondas siguientes se crean semanas después.
            const late = candidates.filter((match, index) => {
                const created = objectIdTime(match._id)
                if (created === null) return false
                if (finalTime !== null && created > finalTime) return true
                const previous = candidates[index - 1]
                return (
                    proposals.get(idKey(match._id)).level ===
                        LEVELS.objectIdEra &&
                    previous !== undefined &&
                    created - objectIdTime(previous._id) > LATE_GAP_MS
                )
            })
            if (!late.length) return

            items.push({
                kind: "lateAddition",
                tournamentId,
                ids: late.map((match) => idKey(match._id)),
                detail: `${tournamentName(tournamentId)}: ${
                    late.length
                } partidos creados después de la final o más de 30 días después del anterior (${late
                    .map(
                        (match) =>
                            `${idKey(match._id)} ${match.type}${
                                match.playoff_id !== undefined
                                    ? ` ${match.playoff_id}`
                                    : ""
                            }${match.valid === false ? " valid:false" : ""}`
                    )
                    .join(", ")})`,
                suggestion:
                    "quedan con la regla actual; para otra fecha, agregarlos a manualMatchDates o a un grupo de matchIds (p. ej. el de Postman de la SLI 2022)",
            })
        })
    return items
}

const pairKey = (a, b) => [String(a), String(b)].sort().join("|")

const postmanEvidence = ({ overrides, ctx }) => {
    const group = overrides.groups.find(
        (item) => item.key === GROUP_KEYS.sliPostman
    )
    if (!group) return null

    const listed = new Set(group.matchIds || [])
    const regular = (ctx.byTournament.get(group.tournamentId) || []).filter(
        (match) => match.type === "regular"
    )
    const rest = regular.filter((match) => !listed.has(idKey(match._id)))
    const createdTimes = rest
        .map((match) => objectIdTime(match._id))
        .filter((time) => time !== null)
        .sort((a, b) => a - b)
    const median = createdTimes.length
        ? createdTimes[Math.floor(createdTimes.length / 2)]
        : null

    const teamMatches = (teamId, source) =>
        source.filter(
            (match) =>
                String(match.teamP1?.id) === String(teamId) ||
                String(match.teamP2?.id) === String(teamId)
        )
    const firstCreated = (teamId) =>
        iso(
            minOf(
                teamMatches(teamId, rest).map((match) =>
                    objectIdTime(match._id)
                )
            )
        )

    const matches = regular
        .filter((match) => listed.has(idKey(match._id)))
        .sort(compareIdAsc)
        .map((match) => {
            const key = pairKey(match.teamP1?.id, match.teamP2?.id)
            return {
                _id: idKey(match._id),
                group: match.group,
                teamP1Id: match.teamP1?.id,
                teamP2Id: match.teamP2?.id,
                pairingElsewhere: rest.filter(
                    (other) =>
                        pairKey(other.teamP1?.id, other.teamP2?.id) === key
                ).length,
                teamMatches: {
                    p1: teamMatches(match.teamP1?.id, regular).length,
                    p2: teamMatches(match.teamP2?.id, regular).length,
                },
                teamFirstCreatedOutsideGroup: {
                    p1: firstCreated(match.teamP1?.id),
                    p2: firstCreated(match.teamP2?.id),
                },
            }
        })

    const roundRobin = {}
    const byGroup = new Map()
    regular.forEach((match) => {
        const key = match.group ?? "-"
        if (!byGroup.has(key)) byGroup.set(key, [])
        byGroup.get(key).push(match)
    })
    byGroup.forEach((groupMatches, key) => {
        const teams = new Set()
        groupMatches.forEach((match) => {
            teams.add(String(match.teamP1?.id))
            teams.add(String(match.teamP2?.id))
        })
        const pairCounts = (source) => {
            const counts = new Map()
            source.forEach((match) => {
                const pair = pairKey(match.teamP1?.id, match.teamP2?.id)
                counts.set(pair, (counts.get(pair) || 0) + 1)
            })
            return counts
        }
        const expectedPairs = (teams.size * (teams.size - 1)) / 2
        const complete = (counts) => {
            const values = [...counts.values()]
            return (
                counts.size === expectedPairs &&
                values.length > 0 &&
                values.every((value) => value === values[0])
            )
        }
        const withGroup = pairCounts(groupMatches)
        const withoutGroup = pairCounts(
            groupMatches.filter((match) => !listed.has(idKey(match._id)))
        )
        roundRobin[key] = {
            teams: teams.size,
            expectedPairs,
            matches: groupMatches.length,
            fromGroup: groupMatches.filter((match) =>
                listed.has(idKey(match._id))
            ).length,
            completeWithGroup: complete(withGroup),
            completeWithoutGroup: complete(withoutGroup),
        }
    })

    return {
        tournamentId: group.tournamentId,
        restMedianCreatedAt: iso(median),
        matches,
        roundRobin,
    }
}

const plan = (snapshot, context = {}, options = {}) => {
    const overrides = options.overrides || DEFAULT_OVERRIDES
    const problems = validateOverrides(overrides)
    if (problems.length) {
        return {
            ops: [],
            report: {
                summary: { scanned: snapshot.matches.length, toChange: 0 },
                checks: [
                    check(
                        "overrides válidos",
                        false,
                        problems.slice(0, 20).join("; ")
                    ),
                ],
            },
        }
    }

    const ctx = buildContext(snapshot, overrides)
    const names = new Map(
        snapshot.tournaments.map((tournament) => [
            idKey(tournament._id),
            tournament.name,
        ])
    )
    const tournamentName = (tournamentId) =>
        tournamentId === null
            ? "(sin torneo)"
            : names.get(tournamentId) || `(torneo ${tournamentId})`

    const played = snapshot.matches.filter((match) => match.played === true)
    const proposals = new Map()
    const ops = []
    const byRule = {}
    const byTournament = new Map()
    const unplayedWithPlayedAt = []

    snapshot.matches.forEach((match) => {
        if (match.played !== true) {
            if (match.playedAt !== undefined) {
                unplayedWithPlayedAt.push(idKey(match._id))
            }
            return
        }
        const proposal = proposePlayedAt(match, ctx)
        proposals.set(idKey(match._id), proposal)
        byRule[proposal.group] = (byRule[proposal.group] || 0) + 1

        const key = tournamentKey(match)
        if (!byTournament.has(key)) {
            byTournament.set(key, {
                tournamentId: key,
                name: tournamentName(key),
                toChange: 0,
                byRule: {},
            })
        }
        const entry = byTournament.get(key)
        entry.byRule[proposal.group] = (entry.byRule[proposal.group] || 0) + 1

        if (proposal.time === null) return
        const op = buildOp(match, proposal)
        if (op) {
            ops.push(op)
            entry.toChange += 1
        }
    })

    const simulated = applyOpsInMemory(snapshot, ops)
    const withoutPlayedAt = simulated.matches
        .filter(
            (match) =>
                match.played === true &&
                (match.playedAt === undefined || match.playedAt === null)
        )
        .map((match) => idKey(match._id))
    const opsOnUnplayed = ops
        .filter((op) => ctx.matchesById.get(idKey(op._id))?.played !== true)
        .map((op) => idKey(op._id))

    const manual = manualChecks({ overrides, ctx, proposals })
    const checks = [
        check("overrides válidos", true),
        ...groupChecks({ overrides, ctx, proposals, played }),
        ...manual.checks,
        check(
            "0 jugados sin playedAt tras simular",
            !withoutPlayedAt.length,
            listDetail("sin playedAt (¿sin updatedAt?)", withoutPlayedAt)
        ),
        check(
            "0 no jugados con propuesta",
            !opsOnUnplayed.length,
            listDetail("no jugados", opsOnUnplayed)
        ),
    ]

    // Idas afectadas por el P0 (aunque las cubra manualMatchDates).
    const affectedLegs = played
        .map((match) => ({ match, siblings: stuckSiblings(match, ctx) }))
        .filter(({ siblings }) => siblings.length)
    const repaired = played.filter(
        (match) => proposals.get(idKey(match._id)).level === LEVELS.twoLegged
    )
    const lateAdditions = detectLateAdditions({
        snapshot,
        ctx,
        proposals,
        tournamentName,
    })
    const postman = postmanEvidence({ overrides, ctx })

    // Confirmado por el usuario: las tandas son jornadas cargadas juntas en
    // orden de juego y los agregados tardíos son los valid:false que llegaron
    // con esa funcionalidad. Quedan como notas informativas.
    const needsConfirmation = []
    const notes = [
        ...detectBatches({ played, proposals, tournamentName }),
        ...lateAdditions,
    ].map((item) => ({ ...item, informational: true }))
    if (affectedLegs.length) {
        // Si todas las idas afectadas tienen fecha manual, es informativo.
        const uncovered = affectedLegs.filter(
            ({ match }) =>
                proposals.get(idKey(match._id)).level !== LEVELS.manual
        )
        ;(uncovered.length ? needsConfirmation : notes).push({
            kind: "twoLeggedLeg1Repair",
            ids: affectedLegs.map(({ match }) => idKey(match._id)),
            detail: affectedLegs
                .map(({ match, siblings }) => {
                    const proposal = proposals.get(idKey(match._id))
                    return `ida ${idKey(match._id)} (llave ${
                        match.playoff_id
                    }) pegada a ${siblings
                        .map((sibling) => idKey(sibling._id))
                        .join("/")}: ${proposal.rule} -> ${iso(
                        proposal.time
                    )} ${proposal.precision}`
                })
                .join("; "),
            suggestion:
                "las que no están en manualMatchDates quedan approx (vuelta − offset); si se conoce la hora real, completar templates.manualMatchDates",
        })
    }
    if (postman) {
        const unique = postman.matches.filter(
            (match) => match.pairingElsewhere === 0
        ).length
        // El usuario confirmó que son los primeros partidos del torneo.
        notes.push({
            kind: "sliPostmanEarlyRounds",
            informational: true,
            ids: postman.matches.map((match) => match._id),
            detail: `${unique} de ${
                postman.matches.length
            } cruces no aparecen en otro regular del torneo; round-robin completo con el grupo: ${Object.entries(
                postman.roundRobin
            )
                .map(
                    ([key, value]) =>
                        `${key} ${
                            value.completeWithGroup ? "sí" : "no"
                        } (sin el grupo ${
                            value.completeWithoutGroup ? "sí" : "no"
                        })`
                )
                .join(", ")}`,
            suggestion:
                "confirmado por el usuario: son de las primeras fechas, así que quedan antes del primer ObjectId del torneo, en orden de carga",
        })
    }

    const templates = {
        manualMatchDates: [
            ...repaired.map((match) => idKey(match._id)),
            ...lateAdditions.flatMap((item) => item.ids),
        ].map((matchId) => ({ matchId, playedAt: null, precision: "exact" })),
    }

    const byGroup = ops.reduce((counts, op) => {
        counts[op.group] = (counts[op.group] || 0) + 1
        return counts
    }, {})

    return {
        ops,
        report: {
            summary: {
                scanned: snapshot.matches.length,
                played: played.length,
                toChange: ops.length,
                byRule,
                byGroup,
                unplayedWithPlayedAt: unplayedWithPlayedAt.length,
            },
            byTournament: [...byTournament.values()].sort(
                (a, b) => b.toChange - a.toChange
            ),
            checks,
            needsConfirmation: unplayedWithPlayedAt.length
                ? [
                      ...needsConfirmation,
                      {
                          kind: "unplayedWithPlayedAt",
                          ids: unplayedWithPlayedAt,
                          detail: "partidos no jugados con playedAt (no se tocan)",
                          suggestion: "revisar a mano",
                      },
                  ]
                : needsConfirmation,
            notes,
            templates,
            evidence: {
                manualMatchDates: manual.evidence,
                sliPostman: postman,
            },
        },
    }
}

const createMigration = (options = {}) => ({
    id: ID,
    title: "M2: playedAt de los partidos jugados",
    dependsOn: [],
    collections: [MATCHES],
    plan: (snapshot, context) => plan(snapshot, context, options),
})

module.exports = {
    ...createMigration(),
    GROUP_KEYS,
    LEVELS,
    POSTMAN_REENTRY_DAYS,
    buildContext,
    createMigration,
    linearSpreadTimes,
    proposePlayedAt,
    validateOverrides,
}
