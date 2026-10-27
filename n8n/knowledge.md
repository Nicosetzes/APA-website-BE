# REGLAS Y FORMATOS

Esta sección es todo lo que sabés sobre cómo se juega en APA. Si algo no está acá, no lo sabés.

## Cómo se juega

-   Los torneos se juegan entre los jugadores del sitio. No siempre los jugadores tienen la misma cantidad de equipos en un torneo, aunque es lo más común. Los equipos son asignados al crear el torneo. En la fase regular cada partido enfrenta a un equipo de un jugador contra un equipo de otro: no se juegan partidos entre equipos del mismo jugador.
-   Un partido pendiente es uno que todavía no se jugó. Los resultados los cargan en el sitio los jugadores del torneo (cualquiera de ellos puede cargar o corregir resultados de su torneo) y el administrador. Cualquier usuario con sesión puede crear un torneo.
-   Un torneo está activo hasta que se define el campeón. Una liga se cierra a mano y su campeón es el primero de la tabla, aunque queden partidos sin jugar; los formatos con playoff terminan cuando se juega la final.

## Tabla de posiciones

-   3 puntos por victoria y 1 por empate.
-   Desempate: diferencia de gol, después goles a favor y después menos goles en contra.
-   En los formatos con grupos hay una tabla por grupo (zona).

## Formatos de torneo

Los nombres internos del formato, tal como los devuelven `listar_torneos` y `campeones_de_torneos`, y cómo se llaman en el sitio:

-   league = Liga
-   league_playin_playoff = Superliga
-   playoff = Eliminatoria
-   world_cup = Mundial
-   world_cup_2026 = Mundial 2026
-   super_cup = Supercopa
-   champions_league = Champions
-   american_cup = Copa América y club_world_cup = Mundial de Clubes: formatos de torneos viejos. No tenés sus reglas.

### Liga

Una sola tabla. Todos contra todos una vez (menos entre equipos del mismo jugador). Sin eliminatorias: el campeón es el primero de la tabla y el subcampeón el segundo. Tiene un Simulador para probar resultados posibles.

### Superliga

-   Dos grupos, A y B, cada uno con su tabla. Dentro de cada grupo se juega todos contra todos una vez.
-   Del 1° al 6° de cada grupo clasifican directo al playoff (12 equipos).
-   Del 7° al 10° de cada grupo juegan el play-in: 7° vs 8° y 9° vs 10°. El perdedor del 7° vs 8° juega contra el ganador del 9° vs 10°. Clasifican el ganador del 7° vs 8° y el ganador de esa última llave: 2 por grupo, 4 en total. Del 11° en adelante quedan eliminados.
-   Los 12 clasificados directos y los 4 del play-in forman un playoff de 16 equipos, de partido único. Los equipos se ordenan por rendimiento (puntos, diferencia de gol, goles a favor y menos goles en contra) y el mejor enfrenta al peor (1° contra 16°). Los ganadores de la primera llave del play-in quedan mejor ubicados que los de la segunda.
-   El play-in se puede armar cuando la clasificación de la fase regular ya no cambia, aunque queden partidos sin jugar. El playoff se arma cuando se jugaron los 6 partidos del play-in.

### Eliminatoria

Eliminación directa de 32 equipos, sin grupos ni tabla. Se define al crear el torneo si los cruces son de partido único o de ida y vuelta.

### Mundial

-   Grupos de la A a la H, todos contra todos una vez en cada grupo. Clasifican el 1° y el 2° de cada grupo: 16 equipos que juegan un cuadro de eliminación directa de partido único.

### Mundial 2026

-   Grupos de la A a la L, todos contra todos una vez en cada grupo. Clasifican el 1° y el 2° de cada grupo y los 8 mejores terceros: 32 equipos que juegan un cuadro de eliminación directa de partido único, empezando por los 16vos de final.
-   Los terceros se ordenan entre sí con el mismo criterio de la tabla. Solo los primeros de los grupos E, I, D, G, A, L, B y K enfrentan a un tercero. El mejor de esos primeros juega contra el peor de los terceros clasificados, el segundo mejor contra el segundo peor, y así. Dos equipos del mismo grupo no pueden cruzarse en la primera ronda: si el emparejamiento lo produce, ese cruce se reasigna al siguiente tercero disponible.
-   La vista Cruces muestra el cuadro preliminar según las posiciones del momento.

### Supercopa

-   Grupos de la A a la F, todos contra todos una vez en cada grupo. Clasifican el 1° y el 2° de cada grupo y los 4 mejores terceros: 16 equipos con cuadro de eliminación directa de partido único.
-   Los terceros se ordenan y se emparejan igual que en el Mundial 2026. Enfrentan a un tercero los primeros de los grupos B, F, E y C.
-   La vista Cruces muestra el cuadro preliminar.

### Champions

Grupos de la A a la H en los que cada cruce se juega dos veces (ida y vuelta). Clasifican el 1° y el 2° de cada grupo: 16 equipos que juegan un cuadro de eliminación directa con cruces de ida y vuelta, desde los 8vos de final hasta la final.

## Cruces de eliminación directa (playoff y play-in)

-   Partido único: si empatan hay alargue (gol de plata) y, si sigue igualado, se define por penales. En el sitio el partido se carga con el marcador y los penales.
-   Ida y vuelta: se suman los goles de los dos partidos. Si el global queda empatado se juega un tercer partido de desempate a gol de oro: avanza quien convierte primero, sin penales. Ese partido de desempate no cuenta en las estadísticas ni en el rating.
-   Si los dos equipos de un cruce son del mismo jugador, el partido no se juega: el jugador elige cuál avanza.
-   Si un partido no se juega (por ejemplo la vuelta) el otro equipo avanza por W.O. y ese partido no cuenta en las estadísticas.
-   Rondas: 16vos de final, 8vos de final, 4tos de final, semifinales y final. Cada cruce del cuadro aparece cuando se define quién llega, por eso a veces hay cruces con un solo equipo o con el rival por definir.

## Partidos pendientes y jugables

-   Un partido es jugable cuando todavía no se jugó y sus dos jugadores ya están definidos.
-   Un cruce de playoff con un solo equipo definido todavía no se puede jugar: falta que termine el cruce anterior.
-   Los partidos entre dos equipos del mismo jugador no cuentan como pendientes.

## APA Rating (el ELO del sitio)

-   Es un ranking de jugadores, no de equipos. Todos empiezan en 1500 y el rating se recalcula con todo el historial de partidos, en orden.
-   Después de cada partido, uno sube y el otro baja la misma cantidad de puntos. Un solo partido mueve como máximo 12 puntos.
-   Cuánto se mueve depende de lo esperado: ganarle a un rival mucho mejor ubicado suma más que ganarle a uno peor; perder con uno peor resta más. Un empate vale medio punto para cada uno, incluso si se definió por penales.
-   Desde la versión 2.0 también cuenta el equipo: a cada equipo se le suma su fuerza (el "overall" de la edición del juego con la que se jugó el torneo). Por eso ganar con un equipo fuerte suma menos y ganar con uno débil suma más. El rating que se muestra es el del jugador y no incluye el equipo.
-   Hasta los 10 partidos el rating es provisorio.
-   No cuenta la diferencia de gol ni la fase del torneo: una goleada suma lo mismo que un 1-0, y una final lo mismo que un partido de grupo.
-   El rating se ve en Stats, en la pestaña Jugadores.
-   En los partidos de playoff de partido único se muestra la "probabilidad de éxito": la chance que el rating le da a cada lado de avanzar de ronda. En liga e ida y vuelta se muestra victoria, empate o derrota. Son estimaciones, no resultados.
-   El asistente puede decir quién es el favorito de un partido pendiente "según el modelo". Sale de los ratings actuales de los dos jugadores y de la fuerza de los equipos que usan, no del historial entre ellos. Solo se marca un favorito si hay una ventaja clara: "levemente favorito", "favorito" o "gran favorito"; si el duelo está parejo, el modelo no marca ninguno. El porcentaje es la chance de ganar ese partido, o de avanzar de ronda en un cruce de partido único. En ida y vuelta, la cifra es de ese partido y no de toda la serie. Es una estimación, no una garantía.
