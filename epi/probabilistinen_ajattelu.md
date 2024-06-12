# Probabilistinen ajattelu

Olet sopinut tapaavasi kaverisi tänään kello kymmenen. Hän ei saavu ajoissa paikalle. Odotat. Kello näyttää 10:10. "Ehkä hän on unohtanut tai juuttunut johonkin muualle", pohdit. Odotat lisää. Epäilysi kaverisi saapumisesta voimistuvat ajan edetessä. Kello näyttää 10:20. Kaveria ei näy, ja luovutat asian suhteen.

Tarinan opetus?

Ensinnäkin olet epävarma siitä, miten käy: et tiedä, tuleeko kaveri paikalle vai ei. Jos kysyt itseltäsi, saapuuko kaverisi paikalle vai ei, paras vastaus ei ole [binäärinen](/epi/binaarinen_jakauma) "kyllä" tai "ei", vaan esimerkiksi "en tiedä" tai "luultavasti".

Lisäksi epävarmuutesi tila muuttuu. Alussa olet epävarmempi kaverisi saapumisesta (ehkä hän tulee, ehkä ei), lopussa varmempi (hän tuskin tulee, luovutan). Vaikka siis kummassakaan tapauksessa "et tiedä" miten käy, uskomusten vahvuutta voi silti vertailla ja [kvantifioida](/epi/kvantifiointi). Jotkut uskomukset ovat vahvempia kuin toiset, joskus aika paljonkin.

Hmm... olisipa kätevää, jos olisi jokin tapa käsitellä epävarmuutta kvantitatiivisesti. Sellainen järjestelmä, joka tarjoaa asteikon uskomuksille. Asteikolla isommat luvut voisivat vastata sitä, että uskoo asiaan vahvemmin ja pienemmät taas sitä, että uskoo heikommin. Ai, ja vielä jos näille luvuille voisi tehdä laskutoimituksia! Niin, että uskomusten epävarmuuksia voisi jotenkin käsitellä ja yhdistellä.

Lukijan suureksi yllätykseksi paljastan, että tällainen järjestelmä on olemassa. Se tunnetaan nimellä todennäköisyyslaskenta.

Tutkitaan alun esimerkkiä tästä näkökulmasta. Alussa odottaisit kaverisi tulevan paikalle -- et tietenkään *varmasti*, mutta ei kaverisi kovin usein unohda asioita. Ja hän on kohtalaisen täsmällinen, joten hän tuskin tulee paljoa myöhässä.

Sinulla on siis *uskomuksia*, *odotuksia* siitä, milloin kaverisi saapuu. Hyvin todennäköisesti hän saapuu. Jos hän saapuu, niin hän saattaa olla myöhässä tai saattaa olla olematta. On kuitenkin epätodennäköistä, että hän on paljoa myöhässä.

Näitä intuitioita voi muuttaa luvuiksi. Sanotaan, että on 90 % todennäköisyys, että kaverisi saapuu paikalle (ja 10 %, että ei). Tämä 90 prosentin osuus jakautuu eri saapumisajoille odotustesi mukaisesti: enemmän prosentteja lähelle kello kymmentä, vähemmän muualle.

Alla kuvassa on yksi esimerkki siitä, miltä uskomukset voivat näyttää. Kukin palikka vastaa yhtä prosenttia kyseiselle lopputulokselle.

![Todennäköisyydet tutun saapumisajalle](Kuvat/prob_1)

Takaisin oikeaan maailmaan: Odotat. Kello näyttää 10:10. Kaverisi ei ole tullut paikalle. Tämä on hieman yllättävää. Uskomuksesi muuttuvat.

Tutkitaan edellistä kuvaa. Palikat, jotka oli asetettu ennen kohtaa 10:10, tulee unohtaa. (Lasken sinun puolestasi: niitä on 75 kappaletta.) Panokset on laitettu väärälle vaihtoehdolle ja siten ne menetetään. Kuva näyttää nyt seuraavalta:

![Osa panoksista katoaa](Kuvat/prob_2)

Tässä on jotakin hassua: kuvassa on laitettu 10 prosentin edestä palikoita sille, ettei kaveri saavu, 15 % sille, että että hän vielä tulee, ja... ai niin, menetit sen 75 %.

Mutta uskomusten pitäisi yhteensä olla tasan 100 % -- ei enempää, ei vähempää. Täten deflaatio iskee ja palikoiden arvo kasvaa! Palikoita on jäljellä enää 25, joten nyt jokainen palikka on neljän prosentin arvoinen. Seuraavassa kuvassa palikat ovat siten kooltaan nelinkertaisia. (Palikoiden sijaintien muutos johtuu vain visualisoinnin haasteista.)

![Uudet todennäköisyydet tutun saapumisajalle](Kuvat/prob_3)

Nyt onkin 40 % todennäköisyys, että kaverisi ei saavu paikalle! Käy tietysti järkeen, että todennäköisyys on kasvanut: jos odotat kaveriasi ja häntä ei näy, alat epäilemään, että hän ei tule ollenkaan.

Samaa peliä voi luonnollisesti pelata uudestaan: odotat, kaverisi ei vieläkään saavu, menetät panoksiasi, jäljelle jäävät palikat kasvavat ja uskomuksesi muuttuvat. Kello 10:20 jäljellä on edelleen 10 (entistäkin suurempaa) palikkaa sille, ettei kaverisi tule, ja vain 1 sille, että hän vielä tulee. Tällöin todennäköisyys sille, ettei kaverisi tule paikalle, on 10 : 1 eli noin 90 prosenttia. Silloin on hyvä aika lähteä.

---

"En ihan ymmärrä. Mistä käytännössä hankitaan todennäköisyydet eri tilanteille? Etkö voi saada laskuista mitä vain tuloksia ulos laittamalla sisään sopivat todennäköisyydet? Joten mikä hyöty tässä on?" kysytään yleisöstä.

Todennäköisyydet kuvaavat uskomusten vahvuuksia. Kenen uskomuksia? Esimerkiksi sinun. Ihmisillä on yleisesti ottaen eri uskomukset ja siten eri todennäköisyydet. Kaverisi saattaa tietää, saapuuko hän luoksesi sovittuun aikaan, vaikka sinä et tätä tietäisi.

Se, että sanot "on 10 prosentin todennäköisyys sille, ettei kaverini tule paikalle", kertoo *sinun uskomuksistasi* koskien kaverin tulemista, siis *sinun pääsi sisällöstä*, *sinun aivoistasi*, ei kaverisi sijainnista. Erityisesti väite ei tarkoita, että kaverisi paikalle tuleminen olisi "oikeasti satunnaista" (mitä ikinä tämä tarkoittaakaan). Se koskee vain ja ainoastaan sinun tietämystäsi. Tietysti (tai toivottavasti) uskomuksesi liittyvät siihen, miten asiat oikeasti ovat. Uskomuksesi ja todellisuus ovat kuitenkin kaksi eri asiaa, aivan kuten kartta ja maasto ovat kaksi eri asiaa.

Ihmiset eivät toki luontaisesti mieti asioita numeerisesti todennäköisyyksien kautta. Toisaalta ihmiset eivät myöskään mieti äänenvoimakkuutta numeerisesti desibelien kautta. Joskus on ollut aika, jolloin ihmiset eivät ole miettineet lämpötilaa numeerisesti Celsius-asteiden kautta (koska asteikkoa ei ollut vielä kehitetty).

Tästä huolimatta jotkut asiat ovat kuumempia kuin toiset, jotkut äänet kovempia kuin toiset ja jotkut uskomukset vahvempia kuin toiset. Jokainen huomaa tämän, vaikkei ihmiskehossa olekaan Celsius-asteet ilmoittavaa lämpömittaria tai todennäköisyydet ilmoittavaa uskomuksenvahvuusmittaria.

Joten mistä ne todennäköisyydet saadaan? Samasta paikasta kuin Celsius-asteet. Sinulla *on jo* paljon tietoa, vaikkakaan ei numeerisessa muodossa. Eikä sitä ole aina helppoa muuttaa lukumuotoon: ehkä sinulla on tosi kylmä ja siksi ajattelet ulkona olevan 30 astetta pakkasta, vaikka sitä on oikeasti vain 20 astetta. Toisaalta näissä muunnoksissa kehittyy kokemuksen myötä: veikkaan, että olet parempi arvioimaan tapahtumien kestoja minuutteina kuin äänenkorkeuksia hertseinä.

Miksi muuttaa uskomuksiaan todennäköisyyksiksi? Samasta syystä kuin etäisyyksiä muutetaan kilometreiksi, massaa muutetaan grammoiksi tai aikaa muutetaan tunneiksi (tai määrää muutetaan luvuiksi). "Muuttaa" on tietysti väärä sana, oikea sana on "mitata".

Hyvin usein riittää vain karkeat *arviot*. Joskus "menee parikymmentä minuuttia" todella kommunikoi asian paremmin kuin "menee vähän aikaa". Lisäksi konsepteilla voidaan tehdä (yksinkertaista tai monimutkaisempaa) *mallinnusta*.

Nämä sama huomiot pätevät myös todennäköisyyksien kohdalla. Joskus "olen 90 % varma" todella kommunikoi asian paremmin kuin "olen aika varma" (tietysti olettaen molempien tietävän, mitä 90 prosenttia todella tarkoittaa). Ja konseptien kautta saa varsin hyviä työkaluja ja malleja uskomusten muodostamiseen.
