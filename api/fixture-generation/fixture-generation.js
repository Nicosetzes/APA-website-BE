// FUNCIÓN PARA GENERAR EL FIXTURE //

const fixture = (lotteryArray, playerArray) => {
  // Calcular cantidad de equipos por jugador: //
  const amountOfTeamsForEachPlayer = lotteryArray.length / playerArray.length;
  console.log(amountOfTeamsForEachPlayer);
  // Calcular cantidad de partidos totales por equipo: //
  const amountOfGamesForEachTeam =
    lotteryArray.length - amountOfTeamsForEachPlayer;
  console.log("partidos por equipo:" + amountOfGamesForEachTeam);
  // Calcular cantidad de partidos en total (del torneo): //
  const totalAmoutOfGames =
    (amountOfGamesForEachTeam * lotteryArray.length) / 2; // Dividido 2, porque en cada partido se involucran 2 equipos;
  console.log("cantidad de partidos total:" + totalAmoutOfGames);
  // Calcular cantidad de partidos por fecha: //
  const amountOfGamesByWeek = lotteryArray.length / 2;
  console.log("partidos por fecha:" + amountOfGamesByWeek);
  // Calcular cantidad de fechas: //
  const totalAmountOfWeeks = totalAmoutOfGames / amountOfGamesByWeek;
  console.log("cantidad de fechas total:" + totalAmountOfWeeks);

  // Declaro las constantes necesarias //

  const weeks = [];
  const matchesAlreadyPlayedInTotal = [];
  const matchesAlreadyPlayedByTeam = [];
  let teamHasPlayedThisWeek = [];
  let temporaryWeek = [];
  let limit = totalAmoutOfGames;
  let teamsThatHaveNotPlayedThisWeek = [...lotteryArray];

  const concertMatch = (randomTeamOne, randomTeamTwo) => {
    if (!randomTeamOne && !randomTeamTwo) {
      console.log("EL PARTIDO NO SERÁ CONCERTADO");
      // Pusheo la fecha como está //
      weeks.push(temporaryWeek);
      temporaryWeek = [];
      teamHasPlayedThisWeek = [];
      teamsThatHaveNotPlayedThisWeek = [...lotteryArray];
    } else {
      console.log(randomTeamOne, randomTeamTwo);
      // Resto un partido al total con el limit--: //
      limit--;
      // Le pusheo la suma los índices sorteados a matchesAlreadyPlayedInTotal: //
      matchesAlreadyPlayedInTotal.push(
        randomTeamOne.team + "vs" + randomTeamTwo.team,
        randomTeamTwo.team + "vs" + randomTeamOne.team
      );
      // Le pusheo los índices individuales sorteados a matchesAlreadyPlayedByTeam para cuantificar cuántos partidos viene jugando cada equipo: //
      matchesAlreadyPlayedByTeam.push(randomTeamOne.team, randomTeamTwo.team);
      // Le pusheo los índices individuales a teamHasPlayedThisWeek: //
      teamHasPlayedThisWeek.push(randomTeamOne.team, randomTeamTwo.team);
      // Averiguo el index de los equipos en teamsThatHaveNotPlayedThisWeek. Los elimino del array: //
      let firstIndex = teamsThatHaveNotPlayedThisWeek.indexOf(randomTeamOne);
      console.log(`Elimino ${randomTeamOne.team} en la posición ${firstIndex}`);
      console.log(
        `En la posición obtenida, se encuentra el equipo: ${teamsThatHaveNotPlayedThisWeek[firstIndex].team}`
      );
      teamsThatHaveNotPlayedThisWeek.splice(firstIndex, 1);
      let secondIndex = teamsThatHaveNotPlayedThisWeek.indexOf(randomTeamTwo);
      console.log(
        `Elimino ${randomTeamTwo.team} en la posición ${secondIndex}`
      );
      console.log(
        `En la posición obtenida, se encuentra el equipo: ${teamsThatHaveNotPlayedThisWeek[secondIndex].team}`
      );
      teamsThatHaveNotPlayedThisWeek.splice(secondIndex, 1);
      console.log("teamsThatHaveNotPlayedThisWeek:");
      console.log(teamsThatHaveNotPlayedThisWeek);
      // Creo un array que tendrá 2 objetos, cada array es un partido: //
      let modifiedGame = {
        playerP1: randomTeamOne.player,
        playerP2: randomTeamTwo.player,
        teamP1: randomTeamOne.team,
        teamP2: randomTeamTwo.team,
        teamIdP1: randomTeamOne.id,
        teamIdP2: randomTeamTwo.id,
        teamLogoP1: randomTeamOne.logo,
        teamLogoP2: randomTeamTwo.logo,
      };
      temporaryWeek.push(modifiedGame);
      // ÚLTIMO PARTIDO DE CADA FECHA //
      if (temporaryWeek.length === amountOfGamesByWeek) {
        console.log("CONCERTÉ EL ÚLTIMO PARTIDO DE LA FECHA");
        weeks.push(temporaryWeek);
        temporaryWeek = [];
        teamHasPlayedThisWeek = [];
        teamsThatHaveNotPlayedThisWeek = [...lotteryArray];
      }
      // ÚLTIMO PARTIDO ARREGLADO (LIMIT = 0): //
      if (limit === 0 && temporaryWeek.length != 0) {
        weeks.push(temporaryWeek);
      }
      // Chequeo si uno de los equipos sorteados ya jugó su máximo de partidos: //
      let firstCount = 0;
      let secondCount = 0;
      // Recorro el array matchesAlreadyPlayedByTeam y cuento la cantidad de partidos que jugó cada equipo: //
      matchesAlreadyPlayedByTeam.forEach((element) => {
        if (element === randomTeamOne.team) {
          firstCount++;
        }
        if (element === randomTeamTwo.team) {
          secondCount++;
        }
      });
      // Calculo cuáles son los índices de los equipos sorteados (para el paso que sigue): //
      let firstTeamIndex = lotteryArray.indexOf(randomTeamOne);
      // Si randomTeamOne alcanzó su máximo de partidos, lo elimino de lotteryArray (por performance): //
      firstCount === amountOfGamesForEachTeam
        ? lotteryArray.splice(firstTeamIndex, 1)
        : console.log(
          `El equipo ${randomTeamOne.team} aun tiene ${amountOfGamesForEachTeam - firstCount
          } partidos por jugar`
        );
      // Como pude haber borrado un elemento, recién ahora debo calcular el índice del randomTeamTwo //
      let secondTeamIndex = lotteryArray.indexOf(randomTeamTwo);
      // Si randomTeamTwo alcanzó su máximo de partidos, lo elimino de lotteryArray (por performance): //
      secondCount === amountOfGamesForEachTeam
        ? lotteryArray.splice(secondTeamIndex, 1)
        : console.log(
          `El equipo ${randomTeamTwo.team} aun tiene ${amountOfGamesForEachTeam - secondCount
          } partidos por jugar`
        );
      firstTeamIndex; // ¿NECESARIO? //
      secondTeamIndex; // ¿NECESARIO? //
    }
  };

  let maxLoops = 1000;

  while (limit > 0) {
    maxLoops--;
    console.log("maxLoops: " + maxLoops);
    if (maxLoops === 0) {
      break;
    }
    // Cuando queden pocos partidos por arreglar, que el pick sea nuevamente desde lotteryArray, y no desde teamsThatHaveNotPlayedThisWeek: //
    // if (limit < amountOfGamesByWeek) {
    //     teamsThatHaveNotPlayedThisWeek = [...lotteryArray]
    // }
    console.log("lotteryArray:");
    console.log(lotteryArray);
    console.log("limit:");
    console.log(limit);
    let firstRandomizedIndex;
    let secondRandomizedIndex;
    let randomTeamOne;
    let randomTeamTwo;
    console.log("temporaryWeek.length:");
    console.log(temporaryWeek.length);
    console.log("teamHasPlayedThisWeek: ");
    console.log(teamHasPlayedThisWeek);
    console.log("teamsThatHaveNotPlayedThisWeek: ");
    console.log(teamsThatHaveNotPlayedThisWeek);
    // Agrego la excepción de amountOfGamesByWeek > 4 así solo aplica para torneos grandes! //
    limit < 2 * amountOfGamesByWeek && amountOfGamesByWeek >= 4
      ? (teamsThatHaveNotPlayedThisWeek = [...lotteryArray])
      : console.log("AUN QUEDAN MUCHOS PARTIDOS");
    firstRandomizedIndex = Math.floor(
      Math.random() * teamsThatHaveNotPlayedThisWeek.length
    );
    secondRandomizedIndex = Math.floor(
      Math.random() * teamsThatHaveNotPlayedThisWeek.length
    );
    // Randomizo los equipos //
    randomTeamOne = teamsThatHaveNotPlayedThisWeek[firstRandomizedIndex];
    randomTeamTwo = teamsThatHaveNotPlayedThisWeek[secondRandomizedIndex];
    console.log("EQUIPOS SORTEADOS: ");
    console.log(randomTeamOne, randomTeamTwo);
    if (
      amountOfGamesByWeek >= 4 &&
      matchesAlreadyPlayedInTotal.some(
        (element) => element === randomTeamOne.team + "vs" + randomTeamTwo.team
      ) &&
      (temporaryWeek.length === amountOfGamesByWeek - 1 ||
        temporaryWeek.length === amountOfGamesByWeek - 2)
    ) {
      console.log("EL PARTIDO YA SE JUGÓ, PASO A LA SIGUIENTE FECHA");
      concertMatch(); // Los parámetros serán undefined //
    }
    if (
      teamsThatHaveNotPlayedThisWeek.length === 1 ||
      teamsThatHaveNotPlayedThisWeek.length === 3
    ) {
      // No podrá concertar partido porque solo hay una opción disponible!
      console.log(
        "NO PODRÉ CONCERTAR PORQUE SOLO HAY 1 O 3 EQUIPOS DISPONIBLES, PASO A LA SIGUIENTE FECHA"
      ); // Para torneos impares (15 equipos por ejemplo)
      concertMatch(); // Los parámetros serán undefined //
    }
    // Con evaluar solo element === randomTeamOne.team + "vs" + randomTeamTwo.team alcanza, porque si está una combinatoria, también está la inversa
    if (
      matchesAlreadyPlayedInTotal.some(
        (element) => element === randomTeamOne.team + "vs" + randomTeamTwo.team
      )
    ) {
      console.log("EL PARTIDO YA SE JUGÓ, REPITO EL WHILE");
      continue;
    }
    // Planteando equipos != en lo que sigue, me aseguro de que NO entre aquí si los random teams fueron los mismos (puede pasar y no es nada malo) //
    if (
      amountOfGamesByWeek > 4 &&
      randomTeamOne.player === randomTeamTwo.player &&
      randomTeamOne.team !== randomTeamTwo.team &&
      temporaryWeek.length > amountOfGamesByWeek - 3
    ) {
      console.log(randomTeamOne.player);
      console.log(randomTeamTwo.player);
      console.log(
        "EL PARTIDO ES ENTRE EQUIPOS DEL MISMO JUGADOR, PASO A LA SIGUIENTE FECHA"
      );
      concertMatch(); // Los parámetros serán undefined //
    }
    // Ahora debo contemplar el caso donde el último partido a agregar es entre equipos del mismo jugador: //
    if (randomTeamOne.player === randomTeamTwo.player) {
      console.log(
        "EL PARTIDO ES ENTRE EQUIPOS DEL MISMO JUGADOR, REPITO EL WHILE"
      );
      continue;
    }
    console.log("NINGUNO DE LOS EQUIPOS HABÍA JUGADO ENTRE SÍ");
    concertMatch(randomTeamOne, randomTeamTwo);
  }

  console.log("weeks:");
  console.log(weeks);
  console.log("matchesAlreadyPlayedInTotal: ");
  console.log(matchesAlreadyPlayedInTotal);
  // console.log("teamsThatHaveNotPlayedThisWeek: ");
  // console.log(teamsThatHaveNotPlayedThisWeek);

  const reducedWeeks = weeks.reduce((acc, curVal) => acc.concat(curVal), []);

  return reducedWeeks;
};

module.exports = {
	fixture
}