---
redirect_from:
  - /blog/distrust_in_bayes/
---
# A cause for distrust in Bayesianism

In this post I articulate a very concrete reason why I'm no longer as fully bought into Bayesianism as I once was.

**I.**

Let's start, as one often does, from the very basics. Suppose we have an urn with $1000$ balls, some red and some blue. For simplicity's sake, suppose you know that the ball color distribution is either $75/25$ or $25/75$ for blue vs. red.

Knowing this, it's very easy to get evidence for which of these hypotheses is right: you just sample from the urn. The details don't really matter, but you can calculate that you get, in expectation, roughly $2 : 1$ odds ratios for the correct hypothesis over the wrong one per sample. Give it ten or twenty samples and you'll be confident in the truth.

And clearly this generalises even if you have lots of hypotheses: the number of samples you need to become confident varies based on the hypotheses and the truth, but just keep sampling and you'll eventually be good.

**II.**

Suppose you then have, not just one, but *two* urns, both again having $1000$ balls. For simplicity's sake, suppose you know that (1) both urns have the same color distribution, and (2) it's again $75/25$ or $25/75$.

This is basically the same as before: just keep sampling. It doesn't matter which urn you sample from, since they follow the same distribution. You again get a solid $2 : 1$ odds ratio per sample on average.

Wait no! It turns out you were wrong: the urns do not have the same content! Assumption (2) was true, but (1) was false: the first urn had $750$ red balls, the second one $250$. Given that this was the case, one can get evidence for *either* hypothesis just by sampling the appropriate urn.

This of course generalises: if you have multiple hypotheses, but none of them are correct, the one you converge to (or if you converge at all) may depend on what you sample. "Just keep sampling and you'll eventually be good" is no longer true!

III.

"So what? Obviously if you have wrong hypotheses, things can go bad for you."

The standard, boring reply is that you'll practically never have the right hypothesis in your hypothesis space. But let me get to a non-standard, non-boring point related to that.

In the particular case of two urns, one could of course consider explicitly all possible hypotheses and perform Bayesian updating over them.

But consider a more realistic case. Let's say we have a million urns, arranged in a $1000 \times 1000$ grid. Based on initial sampling, we know things like "if you go downwards in the grid, you tend to find more red balls" and "urns that are close to each other tend to have similar content": we know that there's a lot of nice structure and patterns, but like in real life, we can't explicitly articulate all that into our prior. What do you do?

The thing I would do is to try and learn a function $p(x, y)$ that takes in the $x$ and $y$ coordinates of an urn to be sampled, and predicts the probability that a ball drawn from that urn is red. Obviously, I can't search over the space of all functions, so I need to look at "simple" functions that respect the structure I know about -- e.g. maybe I only consider logistic regressions with $x$ and $y$ as the input parameters.

Of course, it's plain obvious that my hypothesis space won't contain the true hypothesis. And knowing this doesn't allow me to expand my space so that it both contains the true one and is also practically feasible to work with. So we get back to the issue raised earlier: the way in which I sample affects which hypothesis I will pick up as the best one.

**IV.**

It gets worse: Suppose you distrust me, as a researcher. Not so much that you think I'd fabricate data or even filter it, heaven forbid, but just that I'm somehow going to selectively focus on cases that support whatever conclusion I want to arrive at.

In this case, even if I release all of my data I've collected during my study (in the order I collected them) and you personally compute the likelihood ratios for different hypotheses, you might *still* worry that I have rigged the *sampling procedure* in some way, so that my preferred hypothesis comes out on the top. You might imagine that after sampling for a while and forming a good picture of what some urns are like, I somehow continue by adversarially sampling particular urns most compatible with my bottom line.

There is a naive solution proposal to this problem: if we have million urns, demand we just sample uniformly from them. This is the Schelling point, and if I choose it, you can then be rather reassured I haven't rigged the process.

This proposal doesn't work. Any research project has a finite budget. What if we know that the buckets at the bottom of the $1000 \times 1000$ grid have $100\%$ red balls? It'd be silly to spend lot of effort sampling them, just so we can follow a principle that sounds superficially nice. In real life problems, typically almost all places where you *could* in principle sample from are as uninformative to be completely useless.

There *is* a better-sounding proposal, a better Schelling point. It starts from the informal observation that we want to focus on more "interesting" places. Stating that more formally, we do an expected-information-calculation, i.e. reason about which urn reduces our entropy over our hypotheses the most (in expectation) and then sample there. Naturally, we adapt as we go: we learn things after each draw, so the best urns to sample change. And if you want to determine the best choice of a sequence of million samples, then, well, it might not be an *easy* optimisation problem, but it's clear that there exists a mathematically correct solution, assuming we have chosen a prior over the hypotheses.

I'm worried that this doesn't work either: As discussed, there exist different sampling processes that converge on different hypotheses. It's not obvious that the one which converges fastest will necessarily be the best description of the data! (Indeed, it's easy to construct toy cases where it's not -- cases of reward-hacking, if you will -- but I don't know to what extent to expect this in practice.)

Also, one has to choose a prior for this procedure, and different people might use different priors. If you and I agree on the priors, then great! Even if you think I'm an extremely motivated reasoner and "want" a particular hypothesis to come out on the top, choosing the information-maximizing sampling procedure "ties my hands", so you can trust the process: since you have the same priors, you would have done the same thing in my place. And I think this is an important result!

But if you think my prior is dumb, then I don't know if there's anything short of adversarial collaboration that can resolve our epistemic disagreement, or even allow me to produce data that's of *any* use to you. You *can* compute the likelihood ratios for your hypotheses of choice, sure, but if you don't trust my process for picking where to sample, and know that your hypothesis space doesn't contain the true one either, then can you really trust your likelihoods? I don't know.

V.

This topic of *realizability* is of course very standard and well-known among statisticians, and it's well-known that the sampling distribution matters. But the particular conclusion that

> even if I share all of my raw data and allow people to do hypothesis-updating themselves on hypotheses and priors of their own choice, they still might not be able to trust the results (because they might not trust my process for deciding where to sample)

is something I (to my surprise) haven't heard articulated explicitly before.

For reference, I was familiar with Jaime Sevilla's post on how "[There is no objective way of summarizing a Bayesian update over an event with three outcomes A:B:C as an update over two outcomes A:¬A.](https://www.lesswrong.com/posts/R28ppqby8zftndDAM/a-bayesian-aggregation-paradox)" But I thought we were only dealing with a problem of low-bandwidth-communication here: that okay, sure, fine, people might have more fine-grained hypotheses than I do, so I cannot communicate everything they need for Bayesian updating in my paper's headline results. Too bad, of course there's no theorem that says that any research results can be communicated quickly, so we just need to live with this.

But I'm here claiming that even if we remove the restriction about low bandwidth, we still have a problem! Even if you allow to communicate *literally all data you have*, and that data supports one hypothesis clearly above all, others might still be rightfully suspicious! Fair enough, unlike Jaime Sevilla's point, my problem does not apply to idealised Bayesians who can conceive of all hypotheses (and thus the true hypothesis in particular), but the problem nevertheless seems of practical importance.

VI.

I wrote this post only to highlight this issue, not because I have solutions to it. But a couple of concluding thoughts:

The problem seems to be downstream of the core fact that any given hypothesis in our space performs, under some ways of sampling, worse than some other hypothesis. As a result, you can selectively make a hypothesis lose by sampling in a place where it does poorly.

One way to avoid this is to not require hypotheses to make predictions about everything, but allow them to say "I don't know". In the "$1000 \times 1000$ grid of urns" example, this would straightforwardly result in hypotheses that are not dominated: the hypothesis "this particular urn has exaclty $750$ red balls; no comment on anything else", would, if correct, never lose, even if it only rarely makes any prediction. Bayesianism has been designed for cases where all the hypotheses under consideration have the same "domain", and doesn't provide advice on what to do when that's not the case.

I'll connect this to how I first began thinking about this post. I read about the [Even Odds algorithm](https://www.lesswrong.com/posts/aiz4FCKTgFBtKiWsE/even-odds): to set up a "fair" bet from two probabilistic predictions, while incentivising honesty, have the loser pay the winner the difference of their Brier scores. The algorithm has a free parameter for scaling the amount of money being bet. And when I saw it, [I puzzled](/fairness_or_bayes/):

"Why Brier? Why not use log scores? Fairness-via-equal-subjective-EVs is intuitively compelling, but, y'know, hypothesis-updating-via-Bayes-theorem is also pretty compelling."

Now, if I think of naively applying Bayes' theorem to bets between people, I would have priors on people, compute the likelihood when the bet resolves and get my posteriors. But this is just feels very nonsensical: this would weigh all bets equally, rather than weighing them by some sort of importance metrics or the bettors' reported confidence/how-much-this-bet-reflects-my-worth-as-a-bettor. Relatedly, it's very sensitive to the choice of the sampling distribution, i.e. distribution of things being bet on. Allowing people to say "idk I don't want to bet on this", and overall have a say in how much to bet, is possibly normatively right rather than just socially polite. (Fittingly, [Garrabrant induction](https://intelligence.org/files/LogicalInduction.pdf) allows the traders to decide how much to buy.)

So my answer to "why Brier score, not log score" is: People are not hypotheses. And I tentatively feel like in this particular occasion, the people are more in the right.
