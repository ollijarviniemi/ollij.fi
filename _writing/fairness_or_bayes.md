---
redirect_from:
  - /blog/fairness_or_bayes/
---
# Fairness or Bayes?

Suppose you and your friend disagree about something - like, as usual, about tomorrow's weather. You put 40% on it raining tomorrow, your friend puts 20%. As any civilized people, you want to bet on it. What odds should you pick?

Obviously, the normal 1 : 1 odds don't work, since you both agree it's more likely it doesn't rain than that it does.

Fortunately, there's a [procedure for assigning odds](https://www.lesswrong.com/posts/aiz4FCKTgFBtKiWsE/even-odds) that satisfies the following properties:

1. "Fairness": You both have equal (subjective) expected payoff.

2. "Honesty": Even if you know in advance what the procedure is, and what the other person's probability is, you are still best off reporting your belief honestly.

The solution is: the loser pays the winner the difference of their Brier scores, multiplied by some pre-determined constant (corresponding to how much money you want to bet on).

If, like me, you are a vehement defender of a Bayesian stance to probability theory, you might become suspicious: Why the Brier score? Why not the difference in log scores? Isn't there, like, the whole Bayes theorem and everything that tell what's the normatively correct way to adjust credences on hypotheses after an observation? 

Using the log score would give you honesty (2), but it wouldn't satisfy fairness (1). This presents you with a dilemma. When forced to choose one, which one do you put your faith in: your notions of "fairness", or the axioms of probability theory?

After pondering this for a while, I recently arrived at my answer:

People are not hypotheses.
