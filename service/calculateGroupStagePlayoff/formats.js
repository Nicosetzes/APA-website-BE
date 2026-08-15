const FORMAT_CONFIGS = {
    super_cup: {
        numQualifyingThirds: 4,
        hostsForThirdsGroups: ["B", "F", "E", "C"],
        buildBracket: (firsts, seconds, assignedThirds) => [
            {
                t1: firsts["B"],
                s1: "1B",
                t2: assignedThirds["B"],
                s2: `3${assignedThirds["B"]?.group}`,
            },
            { t1: firsts["A"], s1: "1A", t2: seconds["C"], s2: "2C" },
            {
                t1: firsts["F"],
                s1: "1F",
                t2: assignedThirds["F"],
                s2: `3${assignedThirds["F"]?.group}`,
            },
            { t1: seconds["D"], s1: "2D", t2: seconds["E"], s2: "2E" },
            {
                t1: firsts["E"],
                s1: "1E",
                t2: assignedThirds["E"],
                s2: `3${assignedThirds["E"]?.group}`,
            },
            { t1: firsts["D"], s1: "1D", t2: seconds["F"], s2: "2F" },
            {
                t1: firsts["C"],
                s1: "1C",
                t2: assignedThirds["C"],
                s2: `3${assignedThirds["C"]?.group}`,
            },
            { t1: seconds["A"], s1: "2A", t2: seconds["B"], s2: "2B" },
        ],
    },
    world_cup_2026: {
        numQualifyingThirds: 8,
        hostsForThirdsGroups: ["E", "I", "D", "G", "A", "L", "B", "K"],
        buildBracket: (firsts, seconds, assignedThirds) => [
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
        ],
    },
}

module.exports = FORMAT_CONFIGS
