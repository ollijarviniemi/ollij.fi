---
redirect_from:
  - /blog/ikiliikkuva/
  - /ikiliikkuva/
---

# The perpetual-motion jury

I went to a microeconomics lecture with a friend today. (Did you know you can just walk into a lecture hall without being a student? And nobody comes to stop you?)

They presented the following result about information aggregation, known as [Condorcet's jury theorem](https://en.wikipedia.org/wiki/Condorcet%27s_jury_theorem):

If you have a jury of $N$ people, each of whom has an informed belief about a suspect's guilt (i.e., they are right with some constant probability $p > 0.5$) and those beliefs are independent of each other, then, as $N$ goes to infinity, the probability that the jury's majority vote correct goes to one.

Cool result, right?

Well, I pointed out that the independence assumption is rather strong. I was told that you can correct for it — e.g., if two people agree with each other, then you effectively have $N-1$ people, and the same result holds. And that in general those conditions can be relaxed.

And, well, that downplays the problem.

E. T. Jaynes's book *Probability Theory -- The Logic of Science* discusses the following example: Imagine you want to determine the height of the Emperor of China. You can ask a billion Chinese for the emperor's height. There is of course noise in those estimates, but by taking the average the noise cancels out and you get an answer that is within $0.03$ millimeters of the truth.

But that is of course an unrealistically precise estimate. The root cause is that those people share a lot of common information about their emperor — they are by no means independent, not even approximately.

Similarly, in the jury example, the beliefs of the jurors aren't independent of each other: they are based on the evidence and information presented about the case. The assumption that we have arbitrarily many jurors whose estimates are independent would require, among other things, that we have arbitrarily amounts of information about guilt — which is of course a completely unrealistic assumption!

So even if every one of the jurors thinks the probability of guilt is one in a million, say, this does not necessarily mean the all-things-considered probability of the jury being wrong is below one in a million, let alone arbitrarily small for ever-larger juries. You simply cannot (justifiably) squeeze predictions more confident than a certain bound out of a limited amount of information, just as you cannot build a perpetual-motion machine out of a finite amount of energy.

So the model presented at the lecture isn't just slightly flawed, fixable with small adjustments. No, it is frankly superstition, which fails to grasp where these people's "informed beliefs" come from in the first place.

This is therefore not a technical mathematical point about probability theory, but a fundamental point about how belief formation works: it requires and rests on observations. If there are no observations, there can be no informed estimates. If there is only a limited amount of information, the estimates can only be limited in confidence.
