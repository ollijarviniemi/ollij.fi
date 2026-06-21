---
redirect_from:
  - /blog/todennakoisyysareena/
  - /todennakoisyysareena/
---

# Decision-making training in environments with ground truth

A major insight from mathematics is that there are normatively correct ways of decision-making. More recently, computer science and modern computers have equipped us with the ability to implement those rules in practice in an ever-expanding range of situations.

Constructing such situations, solving the optimal policies and wrapping that all up into a game allows humans to practice decision-making in environments with *immediate ground truth feedback* on the correctness of those decisions. Compare this to real-life decision-making, where feedback

- comes with delay (if at all),
- is very partial (reflecting only some consqeuences of your actions),
- is noisy (reflecting things beyond your control),
- does not take into account your epistemic state (maybe you did the reasonable thing given your information but lost anyways -- or vice versa, you took bad actions even though you "knew better" and got lucky) or affordances more generally (maybe you were dealt a poor hand and there's nothing you could have done), and
- does not come with information about what the correct actions to have taken in your situation were and how far from optimal your actions were (it's far easier to *verify* poor performance than to *generate* better actions).

A hobby of mine has been to design games that "dictate your prior" and allow for determining the optimal policy (no less, computationally tractably), while ideally still being rich enough to train real-world relevant skills.

The series currently contains three games:

**[1: Bayesian Factory belief updating game.](/factory-updating/)** The basic concept is centuries old -- balls and urns, perform Bayesian updates -- but modern computers and graphics smoothly handle much more complex levels and mechanisms than any textbook ever could.

**[2: Aumann Agreement.](/aumann/)** A collaborative two-player game played on a 52-card deck. Players form beliefs and update them based on what the other player thinks, thus practicing theory-of-mind and epistemic deference, following Aumann's theorem (see also [Aaronson's computational procedure](https://www.scottaaronson.com/papers/agree-econ.pdf)).

**3: Key Updates (WIP).** A rich multi-armed bandit problem: the player collects keys to pass a maze of locks by performing Bayesian inference and value-of-information to select the best arm to sample for the next key.

A core challenge in building such games is designing ways of dictating the prior: One *could* leave the priors ill-defined and inferrable through gameplay, but the less specified they are, the more the game is about inferring the right prior. While that's in itself a Bayesian inference task, just one meta-level up, the downside is that there is no ground truth for the *meta*-prior, going against the ethos of the whole exercise. In practice I've always dictated maximum-entropy-priors (i.e. uniform distributions) with legible functional forms built on top of them, all helpfully grounded via natural-to-human narratives such as balls traversing through a factory or cards being drawn from a deck.

Another challenge is maintaining the tractability of computing (or closely approximating) the optimal policy. So far I've gotten by with Good Old-Fashioned AI -- elementary probability theory, Monte Carlo simulations, branch-and-prune, Gittins index, ... -- stringed together and optimised by modern coding agents.

The major open question is how far such techniques will reach, in terms of modeling real-life cognitive work in realistically complicated systems. As one future direction, such games could incorporate the fact that performing observations is itself costly (in human time); this unlocks the ability to build arbitrarily complex systems that in principle could be inspected in totality, but which in practice can't.
