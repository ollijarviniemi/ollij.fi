---
redirect_from:
  - /blog/pythagoras/
---

# Non-standard Pythagoras proof

Y'all ever seen a proof like this for the Pythagorean theorem?

Let $a \diamond b$ be the length of the hypotenuse in a triangle whose legs have length $a$ and $b$.

**Observation 1: Commutativity.** Clearly $a \diamond b = b \diamond a$, so $\diamond$ is commutative.

**Observation 2: Associativity.** By examining a rectangular box whose side lengths are $a$, $b$, and $c$, we see that $(a \diamond b) \diamond c = a \diamond (b \diamond c) = $ the length of the space diagonal, so $\diamond$ is associative.

**Observation 3: Key function.** Let us then denote $f(n) = 1 \diamond 1 \diamond \cdots \diamond 1$, where there are $n$ ones. By associativity and commutativity, $f(n + m) = f(n) \diamond f(m)$.

**Observation 4: Functional equation.** By scale invariance, we have $ka \diamond kb = k \cdot (a \diamond b)$. Thus if we keep $k$ arbitrary, and define $g(n) = k \diamond k \diamond \cdots \diamond k$, where there are $n$ copies of $k$, we obtain inductively $g(n) = k \cdot f(n)$. On the other hand, if $k = f(m)$ for some natural number $m$, then

$$g(n) = \underbrace{k \diamond k \diamond \cdots \diamond k}_{n\text{ times}} = \underbrace{1 \diamond \cdots \diamond 1}_{nm\text{ times}} = f(nm).$$

Thus $f(nm) = f(n)f(m)$ for all natural numbers $n$ and $m$.

**Observation 5: Solving the functional equation.** So $f : \mathbb{N} \to \mathbb{R}$ is multiplicative. It is also clear that $f$ is strictly increasing. As is well known, the only functions satisfying these conditions are of the form $f(n) = n^c$ for some $c > 0$. But by staring at a sheet of graph paper long enough, we notice that $f(2) = \sqrt{2}$, so $c = 1/2$ and thus $f(n) = \sqrt{n}$.

**Observation 6: Finishing up.** Since $f(n + m) = f(n) \diamond f(m)$, we have $\sqrt{n} \diamond \sqrt{m} = \sqrt{n + m}$, i.e., by a change of variables $n \diamond m = \sqrt{n^2 + m^2}$. then continuity scale invariance etc etc

---

(This approach is not new to me; see e.g. [Associative Binary Operations and the Pythagorean Theorem](https://scispace.com/pdf/associative-binary-operations-and-the-pythagorean-3ukadn1q52.pdf), Denis Bell 2010.)
