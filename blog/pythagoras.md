# Pythagoras

Oottekos kaverit koskaan nähny tällaista todistusta Pythagoraan lauseelle:

Olkoon a ¤ b hypotenuusan pituus kolmiossa, jonka kateettien pituudet on a ja b. 

Huomio 1: Kommutatiivisuus. Selvästi a ¤ b = b ¤ a, eli ¤ on kommutatiivinen.

Huomio 2: Assosiatiivusuus. Tutkimalla suorakulmaista särmiötä, jonka sivun pituudet on a, b ja c, nähdään (a ¤ b) ¤ c = a ¤ (b ¤ c) = avaruuslävistäjän pituus, joten ¤ on assosiatiivinen.

Huomio 3: Avainfunktio. Merkitään sitten f(n) = 1 ¤ 1 ¤ ... ¤ 1, missä ykkösiä on n kappaletta. Assosiatiivisuuden ja kommutatiivisuuden nojalla f(n + m) = f(n) ¤ f(m).

Huomio 4: Funktionaaliyhtälö. Skaalainvarianssin vuoksi pätee ka ¤ kb = k * (a ¤ b). Täten jos pidetään k mielivaltaisena, ja määritellään g(n) = k ¤ k ¤ ... ¤ k, missä k:ta on n kappaletta, saadaan induktiivisesti g(n) = k * f(n). Toisaalta jos k = f(m) jollakin luonnollisella luvulla m, niin pätee 
g(n) = k ¤ k ¤ ... ¤ k [n kertaa] = 1 ¤ ... ¤ 1 [nm kertaa] = f(nm).

Täten f(nm) = f(n)f(m) kaikilla luonnollisilla luvuilla n ja m.

Huomio 5: Funktionaaliyhtälön ratkaisu. f : N -> R on siis multiplikatiivinen. On myös selvää, että f on aidosti kasvava. Tunnetusti ainoat funktiot, jotka toteuttavat nämä ehdot, ovat muotoa f(n) = n^c jollakin c > 0. Mutta tuijottamalla ruutupaperiarkkia riittävän pitkään huomataan f(2) = sqrt(2), joten c = 1/2 ja täten f(n) = sqrt(n).

Huomio 6: Viimeistely. Koska f(n + m) = f(n) ¤ f(m), pätee sqrt(n) ¤ sqrt(m) = sqrt(n + m), eli muuttujanvaihdolla n ¤ m = sqrt(n^2 + m^2). sit jatkuvuus skaalainvarianssi yms yms

---

(En ole näköjään ensimmäinen, joka on keksinyt tämän todistuksen -- löysin netistä [täältä](https://mathoverflow.net/a/106824/496479) linkattuna paperin "Associative Binary Operations and the Pythagorean Theorem" (2011), jossa samaan tapaan huomataan assosiatiivisuus 3D-tapauksen kautta, ja että 1 ¤ 1 ¤ 1 ¤ 1 = 2 ja siten p = 2.)

