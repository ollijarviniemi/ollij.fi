# Monia juttuja kannattaa mallintaa differentiaaliyhtälöryhminä

Käydään läpi kahden esimerkin kautta:

**Esimerkki 1.** Kuvitellaan, että lento- tai laivamatkailuun tulee jokin monimutkaisuus, jonka seurauksena koneessa/laivassa pitää olla 10 minuuttia aiempaa aikaisemmin. Esimerkiksi jos tavallisesti laivassa pitää olla 20 minuuttia ennen lähtöä, niin nyt siellä pitääkin olla 30 minuuttia etukäteen.

Oon pariinkin kertaan kuullut ihmisten sanovan suunnilleen "no ei tuo vaikuta matkustamisen määrään mitenkään". En tiedä tarkalleen miksi ne on tuota mieltä, mutta mun veikkaus on, että se on kutakuinkin "ihmiset lentää silloin kun on tarve, ja jos on tarve, niin sitten 10 minuutin lisäodotus ei saa niitä jättään matkaa välistä".

Mutta mun mielestä se ei mee noin. Tykkään selittää asian [seuraavasti](/epi/insentiivit/): Jos laivassa pitäisi olla vaikka kolme tuntia aikaisemmin, niin tää varmasti johtaisi matkustamisen vähenemiseen. Eli 3 tuntia vähentää matkustamista ja 10 minuuttia ei - missä menee raja? No vastaus on tietysti, että mitään kovaa rajaa ei ole: matkustaminen vaan vähenee odotuksen pidetessä.

Jos tuota lähtee mallintamaan matemaattisesti, niin matkustamisen määrä M on funktio (muun muassa) odotusajasta t. Musta on selvää, että M(t):tä kannattaa mallintaa jatkuvana funktiona t:n suhteen ja että se pienenee kun t kasvaa -- siis M'(t) on negatiivinen.

**Esimerkki 2.** Kuvitellaan, että Suomessa ALV:ia nostetaan 24 prosentista 25.5 prosenttiin. Mitä vaikutuksia tällä on?

Naiivi näkökulma on, että tuo ero on niin pieni, ettei se vaikuta kuluttajiin: esimerkiksi jos aiemmin leipäpussin hinta kaupassa on ollut 2€, niin se on nyt 2.02€ -- tuskin vaikuttaa siihen, ostaako ihminen sitä leipää vai ei.

Mutta tuossa mennään harhaan "vaikutus on pieni, joten se on 0".

Jos tutkitaan esimerkiksi tietyn tulorajan alapuolella olevien suomalaisten määrää K, niin siihen vaikuttaa mm. hinnat H ruokakaupassa, joihin vaikuttaa mm. ALV-prosentti a. Ja K(H(a)) on varmaankin kasvava a:n suhteen.

Tämä on tietysti naurettavan yksinkertainen malli: ALV-prosentti vaikuttaa myös valtion verotuloihin ja sitä kautta mahdollisesti sosiaaliturvaan, yritysten toimintaan ja sitä kautta työllisyyteen, tai maan pitkän ajan talouskehitykseen ja sitä kautta kaikkeen. Meneekin vaikeaksi sanoa, mitkä on eri osittaisderivaattojen merkit -- siis onko ALVin kasvattaminen huono vai hyvä juttu jonkin mittarin kannalta -- koska tuo differentiaaliyhtälöryhmä on iso ja monimutkainen. Mutta tuollaista selvittelyähän ne taloustieteilijät tekee työkseen.

---

No sanonko mä tässä mitään ihmeellistä? Tavallaan en:

- On helppo sanoa "juu mallina vaan differentiaaliyhtälöryhmänä", vaikeampi taas oikeasti rakentaa järkevä yhtälöryhmä.
- Diffisyhtälöryhmissäkin voi tulla yllättäviä "jyrkkiä" muutoksia: esim. laivan odotusajoissa voisi olla "kipurajoja", eli että \|M'(t)\| on paljon isompi yhdessä paikassa kuin toisessa, tai hinnoittelussa ero 1,99 euron ja 2 euron välillä voisikin vaikuttaa paljon myyntiin. Eli koska systeemi on differentioituva, se ei välttämättä ole intuitiivisessa mielessä sileä ja jatkuva.

Tavallaan taas joo:

- Musta tuntuu, että tuota "vaikutus on pieni, joten se on 0" -harhaa näkee välillä.
- Ihmiset ehkä pitää tuota "kovia rajoja" -mallia jotenkin oletusarvona (ja haluaa tietää mikä on Terveellinen Raja maitosuklaan syönnille tms.), vaikka itse ajattelen, että se on se poikkeus eikä yleisin tapaus.

Eikä noita diffisyhtälöryhmiä välttämättä ole mahdotonta pystyttää. Esimerkiksi taloustieteessä oikeasti on paljon dataa saatavilla, ja niiden kautta voi saada rakennettua ihan hyviä malleja.

Toisena esimerkkinä oon [nähnyt mainittavan](https://www.lesswrong.com/posts/BhGSXuvTvEtYtJXBe/list-of-civilisational-inadequacy#hEgMHPkd8SBRGETRb), että vois vaan mitata ihmisten hormonitasoja ajan yli ja sitten sovittaa siihen dataan diffisyhtälöryhmän (paitsi valitettavasti meillä [ei kai ole](https://www.lesswrong.com/posts/BhGSXuvTvEtYtJXBe/list-of-civilisational-inadequacy#yBFfuEEHmjiDeYEy6) vielä riittävän hyvää mittausteknologiaa tota varten).
