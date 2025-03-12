# Kunnolla tehty todennäköisyyslaskenta

Käsitykseni todennäköisyyksistä ja tilastotieteestä muuttui, kun luin E. T. Jaynesin kirjan "Probability Theory: The Logic of Science".

Tajusin asioita, jotka nyt tuntuvat ilmeisiltä, mutta jotka tosiaan eivät ole ilmeisiä: uskomusten vahvuutta mitataan todennäköisyyksillä, uskomukset muuttuvat uuden informaation myötä (systemaattisella tavalla), todennäköisyyslaskennan säännöt kertovat miten uskomuksia kuuluu muodostaa, "satunnaisuus" on katsojan silmissä...  Näiden asioiden "ilmeisyydestä" ja keskeisyydestä huolimatta näitä ei oikein osata eikä opeteta. Esimerkiksi itselleni todennäköisyyslaskenta ei ollut aivan vierasta kirjaa lukiessani -- olin käynyt muutaman kurssin maisteritason todennäköisyyskursseja -- mutta silti en ollut näitä perusasioita käsittänyt.

Yksi kirjan kulmakivistä on ns. [Cox'n lause](https://en.wikipedia.org/wiki/Cox%27s_theorem), jossa johdetaan todennäköisyyslaskennan säännöt hyvin heikoista uskomuksia koskevista ehdoista. Todennäköisyyslaskennan säännöt eivät ole vain *suosituksia*: ne ovat *lakeja*, jotka kertovat, miten uskomusten muodostaminen ideaalisti toimii.

Ja kun perustukset on kunnossa, voi lähteä rakentamaan laajempaa kuvaa siitä, miltä hyvä päättely näyttää. Olen koonnut joitakin tällaisia ("ilmeisiä") ohjeita [toisaalla](/epi/miksi_todennakoisyydet) -- tarkoitan siis sellaisia ohjeita kuten

"Evidenssin poissaolo on evidenssiä poissaololle."

"Esimerkki hypoteesista tukee hypoteesia."

"Saman informaation tarjoaminen voi perustellusti johtaa ihmisten uskomusten eriämiseen."

"Pienelläkin määrällä dataa voi perustellusti tehdä pieniä päivityksiä."

En ollut ajatellut, että on olemassa viitekehys, josta voi johtaa tällaisia ohjeita systemaattisesti.

Jaynes käsittelee kirjassaan muutaman luvun ajan verrattain yksinkertaisia ja tunnettuja todennäköisyyslaskennan tilanteita hyvin varovaisesti. Myönnän välillä turhautuneeni, kun Jaynes tuntui jankkaavan pointteja "eri tavalla laskemisen pitäisi aina antaa sama vastaus", "pitää muistaa käyttää kaikkea käsillä olevaa informaatiota" ja muita [ilmeisiä ohjeita](/epi/ilmeiset_ohjeet). Turhautumistani tosin vähensi se, että kirjassa käsiteltiin esimerkkejä siitä, kuinka ihmiset välillä lipsuvat näistä ohjeista huonoin seurauksin.

Todennäköisyyslaskenta tuntuu hankalalta matematiikan osa-alueelta opettaa, koska ihmisillä tuppaa olemaan aiheesta joitakin intuitioita jo valmiiksi, ja jotkin näistä intuitioista ovat vääriä. (Verrattuna sanotaan algebralliseen lukuteoriaan, jossa ihmisillä ei vaikuta olevan syvällä olevia väärinymmärryksiä.) Juuri tämän takia kannattaa käydä perusteet huolellisesti läpi: tämän jälkeen ei saa pelkästään johdettua maalaisjärjen tarjoamia ilmeisiä ohjeita systemaattisesti, vaan pääsee myös eroon niistä maalaisjärjen ilmeisistä ohjeista, jotka ovat väärässä.

Tämä lienee hyvä hetki mainita, että yksi edellä mainitsemistani "ilmeisistä" ohjeista on epätosi.

Hempelin paradoksi kuuluu seuraavasti:

"Hypoteesi 'kaikki varikset ovat mustia' on loogisesti ekvivalentti hypoteesin 'kaikki epämustat asiat ovat epävariksia', ja tätä hypoteesia tukee huomio valkoisesta kengästä."

Mutta tietenkään kenkien värit eivät liity mitenkään lintujen väreihin! On selvää, että jokin tässä menee pieleen.

(Vai onko?)

Olenkin kirjoittanut: Hypoteesin todennäköisyyttä ei voi mitata yksinään. Hypoteesien vertailuun ja uskomusten päivittämiseen tarvitaan *vähintään* kaksi hypoteesia. Pisteytyksessä katsotaan sitä, kuinka hyvin hypoteesi selittää ilmiötä *verrattuna muihin hypoteeseihin*. Ei ole merkityksellistä puhua siitä, onko jokin asia evidenssiä annetulle hypoteesille, ellei ole vähintään yhtä muuta vertailtavaa hypoteesia. Väite "esimerkki hypoteesista tukee hypoteesia" ei siksi ole mielekäs, saatikka tosi.

Ja Hempelin paradoksi ratkeaa. Yksi hypoteesi olkoon "maailmassa on miljoona lintua, joista 100 ovat variksia, ja kaikki linnut ovat mustia". Toinen hypoteesi olkoon "maailmassa on miljoonaa lintua, joista 100 000 ovat mustia variksia ja 900 000 valkoisia variksia". Jos havaitset linnun, ja toteat sen olevan musta varis, on tämä 1 : 1000 -evidenssiä toisen hypoteesin puolesta (ensimmäinen maailma laittaa tälle 0,01 % panoksistaan, toinen 10 %), eli että kaikki varikset eivät olekaan mustia.

Onkohan oikeassa elämässä tilanteita, joissa testataan vain yksittäistä hypoteesia irrallisena muista?

Jaynesin kirjan parhaimpia osia on sen kritiikki tieteessä käytettäviä todennäköisyyslaskennan menetelmiä kohtaan.

Jo perustavanlaatuinen näkökulma "tehdään tilastollinen testi hypoteesin kumoamiseksi (tai todetaan, että se ei kumoutunut)" on virheellinen: taas, hypoteesien vertailuun tarvitaan vähintään kaksi hypoteesia (ja hypoteeseja ei "kumota" vaan niiden todennäköisyydet muuttuvat). Kyllä, käytännössä tilastollisilla testeillä saadaan kuvaa hypoteesin pätevyydestä ja riittävän pienen todennäköisyyden omaavat hypoteesit kannattaa sivuuttaa -- mutta nämä ovat *approksimaatioita*, "jotakin sinne päin" eikä *normatiivisesti oikea* tapa käsitellä hypoteeseja ja epävarmuutta.

Joskus tietysti kätevät ja nopeat (mutta hyvin epätäydelliset) lähestymistavat toimivat riittävän hyvin, joskus taas eivät. Erityisesti yleinen mittari nollahypoteesin kumoamisesta ja p-arvoista kertoo vähän itse tutkittavasta ilmiöstä -- "[the null hypothesis is always false](https://gwern.net/everything)" -- eikä erityisesti kerro vaikutuksen *suuruudesta*, mikä on lopulta usein se mistä olemme kiinnostuneita.

Ennen kirjan lukemista olin ollut hämmentynyt tilastollisista testeistä -- en ymmärtänyt, miten testit on luotu, miksi ne oikeastaan toimivat ja mikä matemaattinen järjestelmä niiden taustalla on. Kirjan luettuani sain vastauksia, vaikkakin ne olivat erityyppisiä kuin odotin. Testien ei ollut tarkoituskaan antaa yleistä lähestymistapaa, jolla laskea hypoteesien todennäköisyyksiä, vaan vain tarjota "käytännössä toimivia" työkaluja. [Toistettavuuskriisin](https://gwern.net/replication) valossa luottoni tähän "käytännössä toimivuuteen" on kuitenkin heikentynyt. Merkittävänä syynä syntyneisiin ongelmiin on aikojen saatossa tehdyt todennäköisyyksien tulkintaan liittyvät [virheet](https://en.wikipedia.org/wiki/Frequentist_probability), ja huonoista perustuksista kärsii koko rakennus. Valitettavasti yksi rakennuksen huoneista on tiede.
