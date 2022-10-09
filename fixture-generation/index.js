// FUNCIÓN PARA GENERAR EL FIXTURE //

const fixture = (lotteryArray, playerArray, tournament) => {
    // Calcular cantidad de equipos por jugador: //
    const amountOfTeamsForEachPlayer = lotteryArray.length / playerArray.length
    // console.log(amountOfTeamsForEachPlayer);
    // Calcular cantidad de partidos totales por equipo: //
    const amountOfGamesForEachTeam =
        lotteryArray.length - amountOfTeamsForEachPlayer
    // console.log("partidos por equipo:" + amountOfGamesForEachTeam);
    // Calcular cantidad de partidos en total (del torneo): //
    const totalAmoutOfGames =
        (amountOfGamesForEachTeam * lotteryArray.length) / 2 // Dividido 2, porque en cada partido se involucran 2 equipos;
    // console.log("cantidad de partidos total:" + totalAmoutOfGames);

    // Declaro las constantes necesarias //

    const allConcertedMatches = []
    const matchesAlreadyPlayedInTotal = []
    const matchesAlreadyPlayedByTeam = []
    let limit = totalAmoutOfGames

    const concertMatch = (randomTeamOne, randomTeamTwo) => {
        if (!randomTeamOne && !randomTeamTwo) {
            // console.log("EL PARTIDO NO SERÁ CONCERTADO");
            // Pusheo la fecha como está //
        } else {
            // console.log(randomTeamOne, randomTeamTwo);
            // Resto un partido al total con el limit--: //
            limit--
            // Le pusheo la suma los índices sorteados a matchesAlreadyPlayedInTotal: //
            matchesAlreadyPlayedInTotal.push(
                randomTeamOne.team.name + "vs" + randomTeamTwo.team.name,
                randomTeamTwo.team.name + "vs" + randomTeamOne.team.name
            )
            // Le pusheo los índices individuales sorteados a matchesAlreadyPlayedByTeam para cuantificar cuántos partidos viene jugando cada equipo: //
            matchesAlreadyPlayedByTeam.push(
                randomTeamOne.team.name,
                randomTeamTwo.team.name
            )

            // Creo el new match //
            const newMatch = {
                playerP1: randomTeamOne.player,
                playerP2: randomTeamTwo.player,
                teamP1: randomTeamOne.team,
                teamP2: randomTeamTwo.team,
                type: "regular",
                tournament,
            }
            allConcertedMatches.push(newMatch)
            // Chequeo si uno de los equipos sorteados ya jugó su máximo de partidos: //
            let firstCount = 0
            let secondCount = 0
            // Recorro el array matchesAlreadyPlayedByTeam y cuento la cantidad de partidos que jugó cada equipo: //
            matchesAlreadyPlayedByTeam.forEach((teamName) => {
                if (teamName == randomTeamOne.team.name) {
                    firstCount++
                }
                if (teamName == randomTeamTwo.team.name) {
                    secondCount++
                }
            })
            // Calculo cuáles son los índices de los equipos sorteados (para el paso que sigue): //
            let firstTeamIndex = lotteryArray.indexOf(randomTeamOne) // REVISAR //
            // Si randomTeamOne alcanzó su máximo de partidos, lo elimino de lotteryArray (por performance): //
            // firstCount === amountOfGamesForEachTeam
            //   ? lotteryArray.splice(firstTeamIndex, 1)
            //   : console.log(
            //       `El equipo ${randomTeamOne.team} aun tiene ${
            //         amountOfGamesForEachTeam - firstCount
            //       } partidos por jugar`
            //     );
            if (firstCount === amountOfGamesForEachTeam)
                lotteryArray.splice(firstTeamIndex, 1)
            // Como pude haber borrado un elemento, recién ahora debo calcular el índice del randomTeamTwo //
            let secondTeamIndex = lotteryArray.indexOf(randomTeamTwo)
            // Si randomTeamTwo alcanzó su máximo de partidos, lo elimino de lotteryArray (por performance): //
            // secondCount === amountOfGamesForEachTeam
            //   ? lotteryArray.splice(secondTeamIndex, 1)
            //   : console.log(
            //       `El equipo ${randomTeamTwo.team} aun tiene ${
            //         amountOfGamesForEachTeam - secondCount
            //       } partidos por jugar`
            //     );
            if (secondCount === amountOfGamesForEachTeam)
                lotteryArray.splice(secondTeamIndex, 1)
        }
    }

    let maxLoops = 1000

    while (limit > 0) {
        maxLoops--
        // console.log("maxLoops: " + maxLoops);
        if (maxLoops === 0) {
            break
        }
        // console.log("lotteryArray:");
        // console.log(lotteryArray);
        // console.log("limit:");
        // console.log(limit);

        let firstRandomizedIndex = Math.floor(
            Math.random() * lotteryArray.length
        )
        let secondRandomizedIndex = Math.floor(
            Math.random() * lotteryArray.length
        )
        // Randomizo los equipos //
        let randomTeamOne = lotteryArray[firstRandomizedIndex]
        let randomTeamTwo = lotteryArray[secondRandomizedIndex]
        // console.log("EQUIPOS SORTEADOS: ");
        // console.log(randomTeamOne, randomTeamTwo);
        // Con evaluar solo element === randomTeamOne.team + "vs" + randomTeamTwo.team alcanza, porque si está una combinatoria, también está la inversa
        if (
            matchesAlreadyPlayedInTotal.some(
                (element) =>
                    element ===
                    randomTeamOne.team.name + "vs" + randomTeamTwo.team.name
            )
        ) {
            // console.log("EL PARTIDO YA SE JUGÓ, REPITO EL WHILE");
            continue
        }
        if (randomTeamOne.player.id === randomTeamTwo.player.id) {
            // console.log(randomTeamOne.player);
            // console.log(randomTeamTwo.player);
            // console.log(
            //   "EL PARTIDO ES ENTRE EQUIPOS DEL MISMO JUGADOR, REPITO EL WHILE"
            // );
            continue
        }
        // console.log("NINGUNO DE LOS EQUIPOS HABÍA JUGADO ENTRE SÍ");
        concertMatch(randomTeamOne, randomTeamTwo)
    }

    // console.log("matchesAlreadyPlayedInTotal: ");
    // console.log(matchesAlreadyPlayedInTotal);
    // console.log("allConcertedMatches:");
    // console.log(allConcertedMatches);

    // const reducedWeeks = allConcertedMatches.reduce(
    //     (acc, curVal) => acc.concat(curVal),
    //     []
    // )

    if (allConcertedMatches.length === totalAmoutOfGames)
        return allConcertedMatches
    else return { error: "Fixture generation has failed, try again" }
}

module.exports = {
    fixture,
}
