---
description: "Explicitly writing down a probability distribution over the set of mathematical results."
---
# LLM-assisted belief articulation exercise
Human beliefs are not natively a probability distribution over explicit hypotheses nor, outside of toy cases, are humans able to articulate their beliefs in this form. However, LLMs have an extensive understanding of human knowledge and beliefs, and can enumerate hypoheses and probabilities cheaply and at scale. 

I ran an experiment on this with Opus 4.8: I messaged my friend to "think of a mathematical result you know and write it down somewhere (but not here)", and then aimed to produce an explicit list of hypotheses equipped with a probability distribution to capture my beliefs on what my friend had written.

---

*Written before being revealed the choice.* I spent around 4 hours on the task. My primary aims were to

1. have my list of hypotheses include what my friend had written, and, more interestingly,
2. have the probabilities correspond to my beliefs under reflection.

The first of these I considered a matter of brainstorming and "thinking outside the box" to surface clusters I hadn't thought of yet, then having Opus 4.8 in Claude Code populate examples based on my suggestions. I compiled 4000 hypotheses (for about 0.25 hypotheses per second). I assigned 30% on my list containing the right answer.

The second was more interesting: I certainly have strong priors about my friend and their mathematical interests, and not only do Opus's priors not match that, they are more broadly alien. In one turn, you have Opus assigning half a percentage for Newton's second law or even Heisenberg's uncerainty principle, estimates I consider orders of magnitude too high. In another turn, having added that my friend has an interest in mathematical logic, Opus proposes similarly high probabilities for highly specialised results in the domain that I (nor my friend, I believe) have never even heard about. 

I played around with various approaches to operationalising my beliefs effectively (given that assigning 4000 probabilities, many in the range of less than one-in-a-million, is impractical): I provided assessments of which two hypotheses were more likely, whether I'd take the over or under for a given hypothesis at a given probability, my beliefs over high-level categories and properies, recommending the model to launch subagents to perform arbitrage given this information (*à la* [Garrabrant induction](https://intelligence.org/files/LogicalInduction.pdf)) and so on, including via a graphical user interface to improve throughput.

Ultimately I was pretty disappointed with the output, doubting that the right answer is on the list and not believing that the list was very reasonable. The exercise updated me negatively on how valuable it is to just be able to take shots in the dark without generally better epistemics and targeting – I could surely have had LLMs come up with 40k or 400k hypotheses more, but I would put very low chance that this would have produced the right one.

---

*Written after being revealed the choice.* The correct hypothesis – "Schur's theorem: For every non-constant univariate polynomial $P$ with integer coefficients, there are infinitely many primes $p$ such that $p$ divides at least one of $P(1), P(2), P(3), \ldots$" – was indeed not in my hypothesis space, despite the theorem being a running joke between my and my friend.

(There was *a* Schur's theorem, but not this one.)

My friend reported also considering the Lifting The Exponent Lemma (another running joke and folk result in olympiad mathematics). This result *was* in the list... at place 2251 and probability 8-in-a-million. Clearly, this probability was not stable under reflection, in part because I was unaware of the presence of the hypothesis in "my" list.

The task at hand was small and toy enough that I believe if I had spent 40 hours instead of 4 on it, and had an appropriately larger compute budget, I would have "solved" it. Nevertheless, I think the observation about LLMs not providing sufficient uplift due to poor epistemics, lack of context and limited bandwidth communication is more broadly applicable.