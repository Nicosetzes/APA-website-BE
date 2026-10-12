const FORMAT_CONFIGS = require("./formats")

const compareByStandings = (a, b) =>
    b.points - a.points ||
    b.scoringDifference - a.scoringDifference ||
    b.goalsFor - a.goalsFor ||
    a.goalsAgainst - b.goalsAgainst

const calculateGroupStagePlayoff = (teams, regularMatches, format) => {
    const { numQualifyingThirds, hostsForThirdsGroups, buildBracket } =
        FORMAT_CONFIGS[format]

    const standingsByGroup = {}
    const teamsIndex = {}

    Object.entries(teams).forEach(([groupName, teamsList]) => {
        standingsByGroup[groupName] = []
        teamsList.forEach(({ team, player }) => {
            const entry = {
                team,
                player,
                group: groupName,
                points: 0,
                played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                scoringDifference: 0,
            }
            standingsByGroup[groupName].push(entry)
            teamsIndex[team.id] = entry
        })
    })

    regularMatches.forEach((match) => {
        if (!match.played && match.scoreP1 === undefined) return

        const { teamP1, teamP2, scoreP1, scoreP2, outcome } = match
        const team1 = teamsIndex[teamP1?.id]
        const team2 = teamsIndex[teamP2?.id]

        if (!team1 || !team2) return

        team1.played++
        team1.goalsFor += scoreP1
        team1.goalsAgainst += scoreP2
        team2.played++
        team2.goalsFor += scoreP2
        team2.goalsAgainst += scoreP1

        if (outcome?.draw) {
            team1.draws++
            team2.draws++
            team1.points++
            team2.points++
        } else {
            if (outcome?.teamThatWon?.id === teamP1.id) {
                team1.wins++
                team2.losses++
                team1.points += 3
            } else {
                team2.wins++
                team1.losses++
                team2.points += 3
            }
        }
    })

    Object.values(standingsByGroup).forEach((group) => {
        group.forEach((team) => {
            team.scoringDifference = team.goalsFor - team.goalsAgainst
        })
        group.sort(compareByStandings)
    })

    const firsts = {}
    const seconds = {}
    const allThirds = []

    Object.entries(standingsByGroup).forEach(([groupName, sortedTeams]) => {
        firsts[groupName] = sortedTeams[0]
        seconds[groupName] = sortedTeams[1]
        allThirds.push(sortedTeams[2])
    })

    allThirds.sort(compareByStandings)

    const thirdsTable = allThirds.map((thirdTeam, index) => ({
        ...thirdTeam,
        rank: index + 1,
        qualified: index < numQualifyingThirds,
    }))

    const bestThirds = thirdsTable.filter((t) => t.qualified)

    const hostsForThirdsList = hostsForThirdsGroups
        .map((g) => firsts[g])
        .sort(compareByStandings)

    const assignWithoutSameGroup = (hostIndex, available, assigned) => {
        if (hostIndex === hostsForThirdsList.length) return assigned

        const host = hostsForThirdsList[hostIndex]
        for (let i = available.length - 1; i >= 0; i--) {
            if (available[i].group === host.group) continue

            const result = assignWithoutSameGroup(
                hostIndex + 1,
                available.filter((_, j) => j !== i),
                { ...assigned, [host.group]: available[i] }
            )
            if (result) return result
        }
        return null
    }

    let assignedThirds = assignWithoutSameGroup(0, [...bestThirds], {})

    // Sin solución matemática posible: se asigna lo que quede, aun del mismo grupo
    if (!assignedThirds) {
        assignedThirds = {}
        const availableThirds = [...bestThirds]
        hostsForThirdsList.forEach((host) => {
            const foundIndex = availableThirds.findLastIndex(
                (t) => t.group !== host.group
            )
            assignedThirds[host.group] =
                foundIndex !== -1
                    ? availableThirds.splice(foundIndex, 1)[0]
                    : availableThirds.pop()
        })
    }

    const bracketLayout = buildBracket(firsts, seconds, assignedThirds)

    const playoffMatches = bracketLayout.map((match, index) => ({
        playerP1: match.t1?.player,
        teamP1: match.t1?.team,
        seedP1: match.s1,
        resultsP1: match.t1 && {
            wins: match.t1.wins,
            draws: match.t1.draws,
            losses: match.t1.losses,
        },

        playerP2: match.t2?.player,
        teamP2: match.t2?.team,
        seedP2: match.s2,
        resultsP2: match.t2 && {
            wins: match.t2.wins,
            draws: match.t2.draws,
            losses: match.t2.losses,
        },

        outcome: null,

        playoff_id: index + 1,
    }))

    return {
        thirdsTable,
        playoffMatches,
    }
}

module.exports = calculateGroupStagePlayoff
