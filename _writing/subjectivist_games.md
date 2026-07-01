---
nav_title: Subjectivist games for accelerated learning
redirect_from:
  - /blog/todennakoisyysareena/
  - /todennakoisyysareena/
  - /ground_truth/
description: "Designing games with computable optimal policies — Bayesian factory, Aumann agreement — to train decision-making with the ground-truth feedback real life lacks."
---
# Subjectivist games for accelerated learning
Both in real life and games, feedback on your level of play typically

- comes with delay (if at all),
- is very partial (reflecting only some consequences of some of your actions),
- is noisy (reflecting things beyond your control),
- does not take into account your epistemic state (maybe you did the reasonable thing given your information but lost anyways – or vice versa, you took bad actions even though you "knew better" but got lucky) or affordances more generally (maybe you were dealt a poor hand and there's nothing you could have done), and
- does not come with information about what the correct actions to have taken in your situation were and how far from optimal your actions were (it's far easier to *verify* poor performance than to *generate* better actions).

The last two points are particularly important: Many games evaluate you based on the *state you managed to get the game's world into*. How many points did you earn in Tetris? Did you get Mario to the end of the level? Did you score more goals than the opponent team? In contrast, few games evaluate *your actions and decisions directly*: given the information, uncertainty and resources you had, were your plays what the optimal player would have done?

(This whole idea is implicitly relying on a major insight from mathematics that is easy to take as obvious: that there exist well-defined notions of "optimal play", even if the game is very complicated, involves randomness and you are wildly uncertain about some of its mechanisms.)

I refer to games that evaluate your play by taking into account your state via *subjectivism*.

## Example games
A hobby of mine has been to design subjectivist games. My recipe has been to (1) "dictate your prior", by making the rules of the game clear while still involving well-defined uncertainty and hidden information, while (2) keeping them simple enough that the optimal policy can be computed in practice.

The series currently contains three games:

**[1: Bayesian Factory belief updating game.](/factory-updating/)** The basic concept is centuries old -- balls and urns, perform Bayesian updates -- but modern computers and graphics smoothly handle much more complex levels and mechanisms than any textbook ever could.

**[2: Aumann Agreement.](/aumann/)** A collaborative two-player game played on a 52-card deck. Players form beliefs and update them based on what the other player thinks, thus practicing theory-of-mind and epistemic deference, following Aumann's theorem (see also [Aaronson's computational procedure](https://www.scottaaronson.com/papers/agree-econ.pdf)).

**3: Key Updates (WIP).** A multi-armed bandit problem: the player collects keys to pass a maze of locks by performing Bayesian inference and weighing value-of-information to select the best arm to sample for the next key.

In all these cases, the subjectivist approach completely removes the stochasticity of the feedback, and is so superior that the "objectivist" versions (where e.g. your Bayesian posteriors on the contents of an urn are scored according to the log score upon the revelation of the "true" hypothesis) are almost laughable in comparison.

## Challenges
A core challenge in building such games is designing ways of dictating the prior: One *could* leave the priors ill-defined and inferrable through gameplay, but the less specified they are, the more the game is about inferring the right prior. While that's in itself a Bayesian inference task, just one meta-level up, the downside is that there is no ground truth for the *meta*-prior, going against the ethos of the whole exercise. In practice I've always dictated maximum-entropy-priors (i.e. uniform distributions) with legible functional forms built on top of them, all helpfully grounded via natural-to-human narratives such as balls traversing through a factory or cards being drawn from a deck.

Another challenge is maintaining the tractability of computing (or closely approximating) the optimal policy. So far I've gotten by with Good Old-Fashioned AI – elementary probability theory, Monte Carlo simulations, branch-and-prune, Gittins index, ... – strung together and optimised by modern coding agents.

These constraints are restrictive and the existing games are toy, and so the attention turns to the future of subjectivist games. 
## More advanced subjectivist games
Corresponding to the two challenges above, there are two broad strands for future improvement of subjectivist games.

**Richer dynamics.** The existing subjectivist games lack many key dynamics appearing in real life and rich games, including: observing a system is not a costless action (as humans are limited in energy and attention, even setting aside the passage of time that would make the notion of optimal play less meaningful), components that cannot practically be modeled fully non-reductionistically, resource acquisition, only very implicitly defined hypothesis spaces, high-level strategies and confusing phenomena.

For practical utility, one would want the games to implement the dynamics and train the cognitive skills that show up in real life. One way to get there may involve relaxing the ideal of a precisely communicated prior, but the question then is the extent to which one can leave the prior unspecified while still keeping the games "subjectivist".

**Policies beside the optimal.** The reason we care about optimal play is not that we terminally care about the optimal play, but because it is *useful to humans for learning*. Thus, for example, well-trained deep learning systems might not play *optimally*, but for practical purposes a vastly superhuman player might as well be – it allows comparing the human, action-by-action, to what a (near) optimal player would have done, thus providing granular feedback on one's performance and biggest mistakes.
## Accelerated human training
But superhuman play is not the right ground truth either: Any experienced chess player knows that a move might be good or even perfect according to "ideal play", but results in a "sharp" position where one will predictably play very suboptimally, and should thus be avoided in favor of safer options. (The fact that AlphaZero sacrifices a rook here does not mean that a mere human player should.) Accordingly, having a highly accurate model of, not the *optimal* play, but *human* play, would allow for even more relevant feedback on how *you*, given all your human limitations, should play.

Going still further, one could procedurally generate positions or levels of a game that are effective for a player's learning – more precisely, that maximise the predicted expected improvements according to some downstream metrics of performance – and do this all at the meta level of designing *games* (including their difficulty progressions, feedback signals, graphics and so on).

This is closely analogous to RL training. So if such "human training" is effective, wouldn't it be effective for AI training as well – in which case, why bother with humans at all? 

One can view the proposal here as distilling skills machines possess into humans, which naturally highlights two differences:

1. In AI training, the aim is to get machines to be able to do things they are not yet able to do. But in human training, we can simply distill the best skills of machines into humans.
2. In AI training, the main cost is compute, whereas in human training, it's human time. As such, one is willing to turn compute into sample efficiency at massively different exchange rates.

The grand question, then, is whether there exist cognitive skills where human improvements would be valuable, and which can be quickly distilled into humans (for example via games) at the cost of compute – and whether such opportunities will arise as AIs develop.