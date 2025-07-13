# Odotusarvo ja epävarmuus

**Anna:** Lottoaminen ei kannata, koska siinä odotusarvo on negatiivinen.

**Bella:** Mitä?

**Anna:** Niin siis odotusarvo lasketaan summaamalla toden--

**Bella:** Minä kyllä tiedän [miten odotusarvo lasketaan](https://en.wikipedia.org/wiki/Expected_value#Examples), mutten näe, miten se liittyy lottoamisen kannattavuuteen mitenkään.

**Anna:** Yleisesti epävarmuutta käsitellessä kannattaa valita vaihtoehto, jolla on suurin odotusarvo. Lottoamisen tapauksessa odotusarvo on negatiivinen, ja lottoamatta jättämisessä se on nolla, joten ei kannata lotota.

**Bella:** Miksi? Siis olen samaa mieltä, että lototessa odotusarvollisesti menettää rahaa, mutta miksi vaihtoehto kannattaa valita odotusarvon mukaan?

**Anna:** ...koska silloin keskimäärin voittaa eniten? Se on mitä odotusarvo tarkoittaa: mikä on keskimääräinen lopputulos.

**Bella:** Kuulostaa epäilyttävästi [mediaanin](https://en.wikipedia.org/wiki/Median) määritelmältä -- mediaani nimenomaan on keskimmäinen lopputulos niin, että 50 % todennäköisyydellä saat enintään niin hyvän tuloksen kuin mediaani ja 50 % todennäköisyydellä vähintään niin hyvän. Miksemme valitse vaihtoehtoa mediaanin mukaan? Tai jonkin muun mittarin mukaan?

**Anna:** *Keskimääräinen* tulos ei ole sama kuin *keskimmäinen* tulos. Kuvittele esimerkiksi peli, jossa 51 prosentin todennäköisyydellä häviät euron, mutta 49 % todennäköisyydellä voitat sata euroa. Mediaani on euron häviö, ja todennäköisemmin häviät kuin voitat, mutta peliin kannattaa silti osallistua.

**Bella:** Hmm, kieltämättä olen tästä samaa mieltä. En silti näe, miksi valita pelit nimenomaan odotusarvon perusteella...

**Bella:** ...oikeastaan, odotusarvokaan ei tunnu oikealta mittarilta.

**Anna:** Kuinka niin?

**Bella:** Sinulle annetaan kaksi vaihtoehtoa. Ensimmäinen vaihtoehto: saat varmasti 10 miljoonaa euroa. Toinen vaihtoehto: saat 51 prosentin todennäköisyydellä 20 miljoonaa euroa ja 49 prosentin todennäköisyydellä et mitään. Minusta tuntuu, että kannattaa valita ensimmäinen, vaikka toisessa on hieman isompi odotusarvo.

**Anna:** Niin, oikeasti [ei kannata maksimoida rahamäärää vaan onnellisuutta](/epi/filosofiatila). 20 miljoonaa euroa ei tee sinua tuplasti niin onnelliseksi kuin 10 miljoonaa euroa. Yleinen nyrkkisääntö sanoo, että onnellisuus käyttäytyy logaritmisesti rahan mukana -- siis esimerkiksi palkan tuplaaminen kasvattaa onnellisuutta suunnilleen yhtä paljon aloituspalkasta riippumatta. Odotusarvoa laskiessa tulee siis ottaa logaritmit rahasummista. Tällä mittarilla laskettuna ensimmäinen vaihtoehto, varma 10 miljoonaa euroa, on parempi.

**Bella:** Eikö yksi skenaario ole se, jossa et saa yhtään rahaa? Ja logaritmi nollasta ei ole määritelty.

**Anna:** Niin no sitä ei kuulu ottaa huomioon, koska nollan euron saaminen tai menettäminen ei vaikuta mitenkään.

**Bella** (epäillen): ...aivan. En ole vieläkään ihan vakuuttunut. Entä sellainen peli, jossa 50% todennäköisyydellä menettää 100 000 euroa ja 50% todennäköisyydellä voittaa 200 000 euroa. Kannattaako siihen osallistua?

**Anna:** Logaritmin odotusarvo on, odotas...

\*Anna huomaa, että logaritmit ja negatiiviset arvot eivät ole yhteensopivia\*

**Anna:** ...niin tosiaan, pelissä ei tule ottaa logaritmia voitoista ja häviöistä, vaan sinun *pelin jälkeisestä varallisuudestasi*. Osallistumisen kannattavuus riippuu tällöin omasta varallisuudestasi: jos olet hyvin rikas, niin kannattaa osallistua, ja jos taas köyhempi, niin ei kannata. Odota, minä voin laskea tarkan kohdan, jossa osallistuminen kannattaa.

**Bella:** Ei tarvitse, tajusin kyllä idean. En siltikään usko, että tämä toimii. Jos varallisuutesi on sata euroa, kai sinun kuitenkin kannattaa osallistua peliin, jossa prosentin todennäköisyydellä menetät ja 99 % todennäköisyydellä voitat sata euroa.

**Anna:** Niin no tämäkin on vain malli -- oikeassa elämässä on mahdollista olla velkaa ja näin edes päin. Eli olen samaa mieltä, että peliin kannattaa osallistua.

**Bella:** Kuule, tämä alkaa kuulostaa siltä, että aina tilanteen tullen vaihdat "mallia" sopivasti niin, että saat odotusarvon laskemisella oikean vastauksen. Tällä saa tietysti rationalisoitua minkä tahansa vaihtoehdon! Valitaan vain "malliksi" sellainen, että siinä "oikean" vaihtoehdon valitseminen vastaa arvoa 1 ja "väärän" valitseminen arvoa -1, jolloin odotusarvon maksimointi antaa oikean lopputuloksen. Tämä ei ole validi perustelu odotusarvon käyttämisen puolesta.

**Anna:** Kyllä odotusarvon käyttämiselle on ihan oikeita perusteluja ja hyötyjä.

**Bella:** Kerro toki lisää.

**Anna:** Kuvitellaan, että sinulle annetaan erilaisia pelejä pelattavaksi. Ehkä yhdestä saat varmasti 2 euroa per pelikerta, toisen pelaaminen maksaa euron mutta siinä voittaa 50% todennäköisyydellä 10 euroa, kolmannessa heitetään noppaa ja saat silmälukujen verran euroja ja niin edelleen. Kuvitellaan myös, että saat pelata pelejä *niin monta kertaa kuin haluat*. Mitä pelejä sinun kannattaa pelata?

**Anna:** Vastaus: sitä, jolla on suurin odotusarvo. Nimittäin *monen* pelikerran jälkeen sinun *keskimääräinen* voittosi, siis kokonaisvoitto jaettuna pelikertojen määrällä, [lähestyy hyvin todennäköisesti odotusarvoa](https://en.wikipedia.org/wiki/Law_of_large_numbers). Esimerkiksi noppapelin pelaaminen sata kertaa antaa sinulle keskimäärin noin 3,5 euroa per peli. Mitä enemmän pelejä pelaat, sitä parempi tämä arvio on. Ja siten suuremman odotusarvon pelejä pelaamalla saat *hyvin* todennäköisesti enemmän rahaa kuin pienemmän odotusarvon peleistä.

**Bella:** Kieltämättä tässä on järkeä. Entä jos kyse on vain yksittäisestä tilanteesta? Harvoinhan sama tilanne toistuu kahdesti.

**Anna:** Raja "saman" ja "eri" tilanteen välillä on häilyvä. Halutessasi voit ajatella, että 38. pelikierros on "eri" tilanne kuin 37. pelikierros, mutta tämä ei muuta sitä, miten sinun kannattaa toimia. Toisessa ääripäässä voit halutessasi nähdä kaikki epävarmuutta koskevat tilanteet vain kysymyksenä siitä, *miten sinä käsittelet epävarmuutta*. Ja jos sinun tarvitsee valita yhtenäinen periaate riskinottoon, sen kannattanee muistuttaa odotusarvon maksimointia.

**Bella:** En ihan ymmärrä.

**Anna:** Sinä olet käytännössä aina [epävarma uskomuksistasi](/epi/probabilistinen_ajattelu) ja siten sinulle tulee vastaan hyvin erilaisia epävarmuutta sisältäviä tilanteita. Kannattaako minun juosta bussipysäkille? En haluaisi juosta, mutta haluaisin kyllä ehtiä seuraavaan vuoroon. Tarvitsenko ulkona takkia? Siellä saattaa olla kylmä, mutten halua turhaan ottaa takkia mukaan. Kannattaako minun käydä hammaslääkärissä tarkastuksessa? Toisaalta se maksaa, mutta toisaalta ehkä he huomaavat jotakin terveydelleni vaarallista. Haenko minä tuonne töihin? Se vaatii vähän vaivaa, ja todennäköisesti minua ei valita, mutta olisin todella tyytyväinen, jos saisin paikan.

**Anna:** Vaikka nämä tilanteet ovat hyvin erilaisia, niillä on yksi yhdistävä tekijä: se, miten sinä käsittelet ne. Ja siten oikea maailma on samankanltainen kuin aiempi esimerkkini peleistä: pitkällä aikavälillä keskimääräinen voittosi määräytyy valittujen vaihtoehtojen odotusarvojen perusteella. Kannattaa siis valita sellaiset vaihtoehdot, joilla on iso odotusarvo.

**Bella:** Niin siis minkä odotusarvo?

**Anna:** ...no tiedäthän, rahan tai onnellisuuden.

**Bella:** Ja miten se lasketaan? Äläkä vain ala puhumaan mistään logaritmeista.

**Anna:** Takin ottamisen tapauksessa voit miettiä, kuinka ikävää on olla ulkona kylmässä ilman takkia *verrattuna* siihen, että otit takin turhaan mukaan. Jos se on vaikkapa kolminkertaisesti niin ikävää, niin sinun kannattaa ottaa takki mukaan, jos kylmän todennäköisyys on yli 25 prosenttia, ja olla ottamatta, jos se on alle 25 prosenttia.

**Bella:** Mitä tarkoittaa, että toinen asia on kolme kertaa niin ikävä kuin ensimmäinen?

**Anna:** ...no tiedäthän, että sinusta olisi yhtä ikävää jos ensimmäinen asia tapahtuisi kolmesti kuin että toinen asia tapahtuisi kerran. Tai probabilistisesti, sinusta olisi yhtä ikävää että toinen asia tapahtuu todennäköisyydellä 1/3 kuin että ensimmäinen tapahtuu todennäköisyydellä 100%.

**Bella:** Aivan kuin hyvyyttä mitattaisiin odotusarvolla.

**Anna:** Kyllä, juuri niin!

**Bella:** Oletko koskaan kuullut sanasta "kehäpäätelmä"?

\*Keskustelua etäältä seurannut Camilla astuu esiin\*

**Camilla:** Kuulostaa siltä, että on minun vuoroni puhua.

**Bella:** Jätän yllättävän ja dramaattisen sisääntulon huomiotta ja annan sinulle vuorosi puhua.

**Camilla:** Kiitos. Annalla on hyviä pointteja, mutta... häneltä tuntuu puuttuvan pohja, jolle muu päättely perustuu. Tämän vuoksi odotusarvomatematiikan yhdistäminen oikeaan maailmaan onnistui heikosti. Selitykset olivat ikään kuin "[vähän sinne päin](/epi/sumuiset_ajatukset)".

**Camilla:** Toiminta toistetuissa peleissä on yksi motivaatio, jonka odotusarvoille voi esittää. Kieltämättä se tarjoaa hyvän intuition. En kuitenkaan pidä sitä *keskeisimpänä* tai *syvimpänä* syynä odotusarvojen tutkimiselle. Kenties fundamentaalein syy odotusarvojen käyttämiselle on, että *koherenteista preferensseistä ja uskomuksista seuraa, että eri preferensseillä on kvantifioitavat painoarvot ja vaihtoehtoja vertaillaan probabilististen odotusarvojen perusteella*.

**Bella:** Preferoisin hitaampaa selitystä.

**Anna:** Kuin myös.

**Camilla:** Se ei ole ihan lyhyt tarina. Tällaisia aiheita on [vaikea kommunikoida suullisesti](/epi/lokaali_kommunikaatio), mutta voin yrittää, kunhan sallitte minulle pari minuuttia monologiaikaa.

**Camilla:** Annan selityksessä *oletettiin*, että asioita voi verrata toisiinsa kvantitatiivisesti -- että toinen asia on kolme kertaa niin huono kuin ensimmäinen -- ja sitten todettiin, että eri vaihtoehtoja ja preferenssejä kannattaa painottaa odotusarvon mukaan. Kuten Bella huomautti, tämä ei ole vielä kovin tyydyttävä selitys: miksi olettaa ylipäätään, että asioita voi verrata kvantitatiivisesti? Myös odotusarvojen perustelu toistettujen pelien kautta jättää epäilyn varaa sille, mikä on "uniikki" tilanne ja mikä "toistettu".

**Camilla:** Itse kertoisin tarinan seuraavasti.

\*Camilla vetää syvään henkeä\*

**Camilla:** Sinulla on maailmaa koskevia uskomuksia. Näissä uskomuksissa on epävarmuutta. Toisaalta näitä epävarmuuksia voi vertailla: pidät joitain asioita "enemmän mahdollisina" kuin toisia. Nämä uskomukset noudattavat myös joitain ilmeisiä ehtoja: esimerkiksi sama väite muotoiltuna eri tavalla on edelleen yhtä "mahdollinen", tai tilanne "sekä A että B tapahtuvat" on enintään niin "mahdollinen" kuin tilanne "A tapahtuu".

*Ainoa* nämä (ja muutamat muut luontevat ehdot) toteuttava tapa käsitellä epävarmuutta on tavallinen todennäköisyyslaskenta. Mikä tahansa muu tapa johtaa välttämättä näiden luontevien ehtojen rikkomiseen.

**Bella:** Onko tämän tarkoitus olla itsestäänselvää?

**Camilla:** Ei.

**Bella:** ...joten aiotko perustella väitettäsi?

**Camilla:** En nyt. Se on vielä pidempi tarina. Voin kyllä suositella sinulle [yhtä kirjaa](/epi/kunnolla), jossa kerrotaan tästä.

**Bella:** Joka tapauksessa, olit pitämässä monologia. Epävarmuuden käsitteleminen todennäköisyyksien avulla käy järkeen. Entä ne preferenssit?

**Camilla:** Sinulla on joitakin preferenssejä: voit esimerkiksi tykätä omenasta enemmän kuin banaanista (tai siitä, ettei sinulla ole ruokaa ollenkaan). Toisaalta uskomuksesi ovat epävarmoja. Preferenssisi silti, tai nimenomaan *siksi*, ulottuvat tilanteisiin, joissa olet epävarma. Et esimerkiksi tiedä *varmasti* saavasi kaupasta omenoita (ehkä kauppa on poikkeuksellisesti kiinni tai sieltä on omenat loppu), mutta käyt silti kaupassa, koska sinun tekee mieli syödä omena ja uskot suurella todennäköisyydellä saavasi kaupasta omenan.

Kuten uskomuksilla, myös preferensseillä on joitain luontevia ehtoja, joita niiden olisi hyvä noudattaa. Jos esimerkiksi preferoit vaihtoehtoa A vaihtoehdon B yli ja vaihtoehtoa B vaihtoehdon C yli, niin varmaankin preferoit vaihtoehtoa A vaihtoehdon C yli. Tai jos 100% todennäköisyys saada omena on parempi kuin 100% todennäköisyys saada banaani, on varmaankin 50% todennäköisyys saada omena parempi kuin 50% todennäköisyys saada banaani (jos muissa tapauksissa et saa mitään).

**Camilla:** *Ainoa* nämä (ja muutaman muun luontevan ehdot) toteuttava tapa käsitellä preferenssejä epävarmojen vaihtoehtojen yli on odotusarvon kautta.

Tarkemmin sanottuna: jos uskomuksesi ja preferenssisi toteuttavat niitä koskevat luontevat ehdot, niin tästä voi *johtaa* sen, että suhteutat asioita kvantitatiivisesti toisiinsa ja maksimoit kvantitatiivisten preferenssien odotusarvoa.

Ja ei, tämäkään ei ole itsestäänselvyys.

**Camilla:** Missään kohtaa emme *olettaneet*, että uskomuksesi vastaavat todennäköisyyksiä, että pystyt kvantifioimaan preferenssejäsi tai että painotat epävarmoja tilanteita niiden todennäköisyyksien suhteessa. Nämä asiat *seuraavat* siitä, että muodostat uskomuksiasi järkevästi ja käsittelet epävarmuutta ja preferenssejä koherentisti.

**Bella:** Tämä kuulostaa järkevältä -- ainakin selvästi vakuuttavammalta kuin Annan selitys. En tosin ihan vieläkään ymmärrä, mikä on se minkä odotusarvoa maksimoidaan.

**Camilla:** Sinun preferenssiesi toteutumista. Jos tämä vastaus ei tyydytä, niin saatat odottaa odotusarvoilta enemmän kuin mitä niiden on tarkoitus tarjota. Nämä argumentit eivät kerro, *mitä preferenssisi ovat*. Se on sinun asiasi. Matematiikka ei sano, että sinun tulee tykätä omenoista enemmän kuin banaaneista. Sen sijaan nämä argumentit kertovat, *miten preferenssejä tulee käsitellä epävarmuuden tilassa*.

Jos et toimi tavalla, joka vastaa odotusarvon maksimoimista, niin saat vähemmän niitä asioita, joita haluaisit saada enemmän. Koherenssiehtojen rikkomisella on *seurauksia*, ja ne ovat *huonoja seurauksia*.

**Bella:** Hmm, ajattelinkin kysyä siitä seuraavaksi: miksi oikeastaan välitämme koherenssiehdoista? Mikä siinä menee pieleen, jos niitä rikkoo?

**Camilla:** Riippuu miten niitä rikkoo! Ihmisillä on monia eri taipumuksia, jotka saavat heidät toimimaan epäjohdonmukaisesti ja joiden seurauksena he saavat vähemmän sitä mitä he haluavat. Tämä taitaa olla helpointa selittää vain antamalla muutama esimerkki, joissa ihmiset toimivat huonosti. Odotas, olen kirjoittanut tekstin aiheesta...
