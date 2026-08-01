const calculate2026WorldCupPlayoffByTournamentId = (teams, regularMatches) => {
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
        group.sort(
            (a, b) =>
                b.points - a.points ||
                b.scoringDifference - a.scoringDifference ||
                b.goalsFor - a.goalsFor ||
                a.goalsAgainst - b.goalsAgainst
        )
    })

    const firsts = {}
    const seconds = {}
    const allThirds = []

    Object.entries(standingsByGroup).forEach(([groupName, sortedTeams]) => {
        firsts[groupName] = sortedTeams[0]
        seconds[groupName] = sortedTeams[1]
        allThirds.push(sortedTeams[2])
    })

    allThirds.sort(
        (a, b) =>
            b.points - a.points ||
            b.scoringDifference - a.scoringDifference ||
            b.goalsFor - a.goalsFor
    )

    const thirdsTable = allThirds.map((thirdTeam, index) => ({
        ...thirdTeam,
        rank: index + 1,
        qualified: index < 8,
    }))

    const bestThirds = thirdsTable.filter((t) => t.qualified)

    const hostsForThirdsList = [
        firsts["E"],
        firsts["I"],
        firsts["D"],
        firsts["G"],
        firsts["A"],
        firsts["L"],
        firsts["B"],
        firsts["K"],
    ].sort(
        (a, b) =>
            b.points - a.points ||
            b.scoringDifference - a.scoringDifference ||
            b.goalsFor - a.goalsFor
    )

    const assignedThirds = {}
    let availableThirds = [...bestThirds]

    hostsForThirdsList.forEach((host) => {
        let foundIndex = -1
        for (let i = availableThirds.length - 1; i >= 0; i--) {
            if (availableThirds[i].group !== host.group) {
                foundIndex = i
                break
            }
        }

        if (foundIndex !== -1) {
            assignedThirds[host.group] = availableThirds.splice(
                foundIndex,
                1
            )[0]
        } else {
            assignedThirds[host.group] = availableThirds.pop()
        }
    })

    const bracketLayout = [
        {
            t1: firsts["E"],
            s1: "1E",
            t2: assignedThirds["E"],
            s2: `3${assignedThirds["E"]?.group}`,
        },
        {
            t1: firsts["I"],
            s1: "1I",
            t2: assignedThirds["I"],
            s2: `3${assignedThirds["I"]?.group}`,
        },
        { t1: seconds["A"], s1: "2A", t2: seconds["B"], s2: "2B" },
        { t1: firsts["F"], s1: "1F", t2: seconds["C"], s2: "2C" },
        { t1: seconds["K"], s1: "2K", t2: seconds["L"], s2: "2L" },
        { t1: firsts["H"], s1: "1H", t2: seconds["J"], s2: "2J" },
        {
            t1: firsts["D"],
            s1: "1D",
            t2: assignedThirds["D"],
            s2: `3${assignedThirds["D"]?.group}`,
        },
        {
            t1: firsts["G"],
            s1: "1G",
            t2: assignedThirds["G"],
            s2: `3${assignedThirds["G"]?.group}`,
        },
        { t1: firsts["C"], s1: "1C", t2: seconds["F"], s2: "2F" },
        { t1: seconds["E"], s1: "2E", t2: seconds["I"], s2: "2I" },
        {
            t1: firsts["A"],
            s1: "1A",
            t2: assignedThirds["A"],
            s2: `3${assignedThirds["A"]?.group}`,
        },
        {
            t1: firsts["L"],
            s1: "1L",
            t2: assignedThirds["L"],
            s2: `3${assignedThirds["L"]?.group}`,
        },
        { t1: firsts["J"], s1: "1J", t2: seconds["H"], s2: "2H" },
        { t1: seconds["D"], s1: "2D", t2: seconds["G"], s2: "2G" },
        {
            t1: firsts["B"],
            s1: "1B",
            t2: assignedThirds["B"],
            s2: `3${assignedThirds["B"]?.group}`,
        },
        {
            t1: firsts["K"],
            s1: "1K",
            t2: assignedThirds["K"],
            s2: `3${assignedThirds["K"]?.group}`,
        },
    ]

    const playoffMatches = bracketLayout.map((match, index) => ({
        playerP1: match.t1?.player,
        teamP1: match.t1?.team,
        seedP1: match.s1,

        playerP2: match.t2?.player,
        teamP2: match.t2?.team,
        seedP2: match.s2,

        outcome: null,

        playoff_id: index + 1,
    }))

    return {
        thirdsTable,
        playoffMatches,
    }
}

module.exports = calculate2026WorldCupPlayoffByTournamentId
