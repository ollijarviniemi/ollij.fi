# Todennäköisyysareena

Todennäköisyydet on informaation ominaisuus: tietyillä lähtötiedoilla on olemassa yksi oikea epävarmuuden taso mihin tahansa väitteeseen liittyen.

Yksinkertaisissa "korttipakasta nostetaan kortteja" -tyylisissä tilanteissa lähtötiedot ja asetelman pystyy kirjoittamaan niin eksplisiittisesti, että tietokoneella pystyy hyvin laskemaan tai arvioimaan, mikä on oikea todennäköisyys.

Tavallisissa oikean maailman tilanteissa, kuten ihan vaikka "kuinka todennäköisesti huomenna sataa?", tämä taas on täysin mahdotonta. (Monestakin syystä, mutta kaksi oleellisinta: 1: Saatavilla olevaa informaatiota ei pysty spesifioimaan, ja se vaihtelee ihmisten välillä. 2: Logical uncertainty -- loogisten implikaatioiden seuraaminen on laskennallisesti hankalaa.)

Korttipakkaesimerkit on pedagogisesti tosi hyödyllisiä, koska niissä on niin vahva palaute: niissä pystyy sanomaan kiistattomasti, että joku tekee oikean tai virheellisen arvion. Oikean elämän epävarmuustilanteissa toi on hankalampaa ja palautetta on vaikeampi kerätä.

Oon pitkään miettinyt, että olisi upeaa, jos epävarmuuden käsittelyn harjoittelua varten saisi laajennettua sitä joukkoa asioita, joissa oikean todennäköisyyden pystyy määrittämään. Korttipakkaesimerkit on hyviä, mutta ne alkaa pidemmän päälle käydä vähän tylsiksi. Ne on myös strukturaalisesti aika erilaisia kuin oikean maailman kysymykset.

Siispä:

Nykyisillä tietokoneilla ja vempeleillä pystyy rakentamaan aikas monimutkaisia simulaatioympäristöjä. Kunhan ne on hyvin spesifioituja, niin tietokoneilla pystyy myös arvioimaan oikeaa todennäköisyyttä riittävällä tarkkuudella.

Iso kysymys on se, miltä nuo simulaatioympäristöt näyttää. Mä en tiedä. Vaatisi kognitiivista työtä, että saisi muutettua tuon idean tarkaksi spesifikaatioksi.

Tässä on kuitenkin jotakin konkretiaa ja ajatuksia:

- Olisi kiva, jos niissä olisi monia eri informaatiokanavia, joista iso osa on ~merkityksettömiä tutkittavissa olevaa väitettä ajatellen. Osa pelaajan tehtävää on tajuta, mikä informaatio on oleellista ja mikä kuuluu sivuuttaa.

- Kuten [eilen twiittasin](/blog/huomioita), musta todennäköisyyksiä on tosi hyvä miettiä vedonlyöntien kautta. Kehystäisinkin nuo pelit päätöksentekona, en prosenteissa esitettyjen todennäköisyysarvioiden ympärille. Jos puhutaan binäärisistä väitteistä, niin tuo on vain kosmeettinen muutos ("tässä on 3 : 1 -payoffit, kumman vaihtoehdon valitset?" on ekvivalentti kysymyksen "onko todennäköisyys yli 75%?" kanssa), mutta musta se on hyvä kosmeettinen muutos. Mutta päätöksentekokehys mahdollistaa sen, että pitää isosta valikoimasta vaihtoehtoja päättää paras (tai tosi hyvä) vaihtoehto, mikä olisi todennäköisyyskehyksestä vaikeampi hoksata. "Beliefs are for decisions" and all that.

- Niissä olisi luonnollisen kielen sisältöä ja flavour-tekstiä. Niissä voisi olla sääennustusta eri mittausten perusteella. Niissä voisi olla potilaan diagnosointia eri oireiden ja tilastojen perusteella. Niissä voisi olla kokeellisen tutkimuksen valitsemista eri pilottikokeiden tulosten perusteella. Niissä voisi olla sijoittamista erilaisten uutisten perusteella. Flavour-tekstit yritettäisiin luoda niin, että ne tavallaan vastaa todellisuutta ja siten pääsee hyödyntämään ihmisten syviä, implisiitisiä intuitioita maailman toiminnasta (ilman, että kaikkea tarvii eksplisiittisesti spesifioida pelin sisällä). Tietysti esim. sääennustus voisi olla eksoplaneetan sään ennustamista, diagnosoitava potilas on viljapellolta löytynyt avaruusolio jne., niin pelin suunnittelijan ei tarvitse olla meteorologian, kirurgian ja tsiljoonan muun alan ekspertti.

- Pelaajaa ei tarvitse pakottaa lukemaan kaikkea sisältöä; tiedonhaku ja missä kohtaa on hankkinut riittävästi tietoa voi olla osa pelin pedagogista arvoa. Peli on kuitenkin reilu, koska pelaajalla oli pääsy kaikkeen relevanttiin informaatioon. (Pitää tosin varoa tilannetta, jossa 99 tekstitiedostoa on täysin irrelevantteja ja yhdessä on se oleellinen tiedon kultanugetti, ja sitten peli on vain puuduttavaa "haravoi tekstiä löytääksesi oikean vastauksen"; tiedon pitää olla järkevästi strukturoitua.)

- Niissä voisi olla jopa sellaista, että sulla on tietty budjetti tehdä lisäkokeita / lisätiedonkeruuta, ja sitten sun pitää käyttää budjetti parhaalla mahdollisella tavalla. Optimaaliset strategiat on taas mahdollista laskea tietokoneella.

- Iso design-kysymys on se, että onko kaikki oleelliset parametrit pelaajan tiedossa etukäteen vai ei. Ero on siis se, tehdäänkö

"Uurnassa on 10 punaista, 20 vihreää ja 30 sinistä palloa; millä todennäköisyydellä kolme ensimmäisenä nostettua palloa on kaikki eri värisiä?"

vai

"Uurnassa on kolmenvärisiä palloja; millä todennäköisyydellä kolme ensimmäistä nostettua palloa on kaikki eri värisiä? Tässä on muuten muutama satunnaisesti nostettu pallo, mutta mä laitan ne nyt takaisin uurnaan."

Eli toisin muotoiltuna kysymys on, varmistetaanko pelaajalla olevan "oikea prior". Olisi paljon esteettisempää, jos tuon saisi mahdollistettua, mutta tuon saavuttaminen voi olla hankalaa. Voi olla, että käytännössä tosta pitää joustaa, ja pelaajalla vaan varmistetaan olevan "riittävän hyvä" prior (esim. just näyttämällä muutama satunnaisesti nostettu pallo) ja peli koitetaan suunnitella olemaan ei-kovin-sensitiivinen priorien suhteen.

- Varmaan haluaisi, että kohtalaisen samanlaista simulaatioympäristöä pystyy kokeilemaan monta kertaa, kun eka pelikerta voi olla vähän raju ja informaation absorbointi voi olla vaikeaa. Toisaalta kuitenkin iso osa ton pelin mehevyyttä olisi siinä, että sä et overfittaa mihinkään yksittäiseen havinnot-generoivaan-prosessiin, vaan on iso valikoima erilaisia prosesseja ja ympäristöjä.

- Olisi tietysti hyvä olla pisteytyssysteemit, jotka antaisi palautetta siitä, miten menee. Ei ole ihan helppo saada intuitiivisa pisteytysskaaloja. Varmaan paras tapa on vaan peluuttaa tota ihmisillä ja saada käsitystä siitä, missä ihmisjakauma menee, ja sitten suhteuttaa uuden pelaajan pisteet siihen.

- Tuossahan voisi olla myös komentorivi ja käteviä kirjastoja ja valmiita metodeja, jos ympäristö on sellainen josta löytyy paljon kvantitatiivista dataa

Musta tää on tosi hauska idea, ja olisi tosi siistiä jos tuollainen olisi olemassa.
