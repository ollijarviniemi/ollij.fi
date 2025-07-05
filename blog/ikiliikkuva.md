# Ikiliikkuva valamiehistö

Kävin tänään kaverin kanssa mikrotaloustieteen luennolla. (Tiesittekö, että te voitte vaan kävellä luentosaliin ilman, että te ootte opiskelija? Ja kukaan ei tuu estämään teitä?)

Siellä esitettiin informaatioaggregaatiosta [tällainen tulos](https://en.wikipedia.org/wiki/Condorcet%27s_jury_theorem):

Jos sulla on N ihmisen valamiehistö, joilla on jokaisella informoitu uskomus epäillyn syyllisyydestä (eli ne on oikeassa vakiotodennäköisellä p > 0.5) ja ne on riippumattomia toisistaan, niin N:n mennessä äärettömään valamiehistön enemmistön todennäköisyys olla oikeassa menee kohti ykköstä.

Ihan siisti tulos, eikö?

No, mä kysyin siellä luennolla, että eikö toi oletus riippumattomuudesta ole aika vahva. Mulle vastattiin, että sitä voi sitten korjata, esim. jos kaksi ihmistä on samaa mieltä keskenään, niin sitten sulla on efektiivisesti N-1 ihmistä, ja sama lopputulos pätee. Ja että yleisesti noita ehtoja voi höllentää.

Ja, no, toi vähättelee sitä ongelmaa.

E. T. Jaynesin Probability theory -kirjassa on seuraavanlainen esimerkki: Kuvitellaan, että sä haluat selvittää Kiinan hallitsijan pituuden. Sä voit kysyä miljardilta kiinalaiselta hallitsijan pituutta. Noissa arvioissa on tietysti kohinaa, mutta ottamalla keskiarvon kohinat kumoutuu ja saadaan vastaus, joka on 0.03mm sisällä oikeasta.

Mutta tuo on tietysti epärealistisen tarkka arvio. Juurisyynä on, että noilla ihmisillä on paljon yhteistä informaatiota hallitsijastaan - ne ei suinkaan ole riippumattomia, ei edes likimäärin.

Takaisin valamiehistöesimerkkiin: Noilla henkilöillä on vaan rajallinen määrä todistusaineistoa ja informaatiota, johon ne perustaa niiden arvionsa. Ja vaikka jokainen olisi sitä mieltä, että syyllisyyden todennäköisyys on 1/miljoona, tämä ei tarkoita, että all-things-considered  todennäköisyys valamiehistön erehtymiselle on alle 1/miljoona. Rajallisesta määrästä informaatiota ei vain pysty (perustellusti) puristamaan tiettyä pistettä itsevarmempia ennustuksia, aivan kuten äärellisestä määrästä energiaa ei saa rakennettua ikiliikkujaa.

Oletus siitä, että meillä on mielivaltaisen paljon ihmisiä, joiden arviot on riippumattomia, tarkoittaa muun muassa sitä, että meillä on mielivaltaisen paljon informaatiota syyllisyydestä -- mikä on tietysti täysin epärealistinen oletus!

Tuo luennolla esitetty malli ei oo siis vain hieman viallinen, jonka saa korjattua pienillä muutoksilla. Ei, se on suoraan sanottuna taikauskoa, jossa ei hahmoteta, mistä näiden ihmisten "informoidut arviot" alunperin tulee.

Tämä ei siis ole tekninen matemaattinen pointti todennäköisyyslaskennasta, vaan fundamentaali pointti siitä, miten uskomusten muodostus toimii: se vaatii ja perustuu havaintoihin. Jos ei ole havaintoja, niin ei voi olla informoituja arvioita, ja jos on vain vähän informaatiota, niin ei voi olla supervarmoja arvioita.
