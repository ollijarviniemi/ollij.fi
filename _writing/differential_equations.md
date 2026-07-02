---
redirect_from:
  - /blog/differentiaaliyhtaloryhmat/
  - /differentiaaliyhtaloryhmat/
description: "Many things simply are continuous and differentiable!"
---

# Systems of differential equations as a baseline for modeling

I think for many phenomena it's reasonable to model them as systems of differential equations. Two examples:

**Example 1.** Imagine that some complication is added to ship travel, as a result of which you have to be on the ship 10 minutes earlier than before. For instance, if normally you have to be on the ship 20 minutes before departure, now you have to be there 30 minutes ahead.

A couple of times I've heard people say roughly "well, that doesn't affect the amount of travel at all." I don't know exactly why they think this, but my guess is they'd argue "people travel when there's a need, and if there's a need, then 10 minutes of extra waiting won't make them skip the trip."

But I don't think it works that way: If you had to be on the ship, say, three hours earlier, this would surely lead to a reduction in travel. So 3 hours reduces travel and 10 minutes doesn't — where do you draw the line? Well, the answer of course is that there's no hard threshold: travel just decreases as the wait grows longer.

If you start to model this mathematically, the amount of travel $M$ is a function of (among other things) the waiting time $t$. To me it's clear that $M(t)$ is worth modeling as a continuous function of $t$ and that it decreases as $t$ grows — that is, $M'(t)$ is negative.

**Example 2.** Imagine that in Finland VAT is raised from 24 percent to 25.5 percent. What effects does this have?

A naive view is that the difference is so small it doesn't affect consumers: for example, if a bag of bread at the store previously cost 2€, now it costs 2.02€ — hardly affects whether a person buys the bread or not. But this is simply rounding a small effect to zero.

In contrast, if we consider, for example, the number $K$ of Finns below a certain income threshold, this is affected by, among other things, the prices $H$ at the grocery store, which are affected by, among other things, the VAT rate $a$. And $K(H(a))$ is presumably (strictly) increasing in $a$.

This is, of course, a ridiculously simple model of VAT: the VAT rate also affects the state's tax revenues and thereby possibly social security, the operations of businesses and thereby employment, or the country's long-term economic development and thereby everything. It gets hard to say what the signs of the various partial derivatives are — that is, whether raising VAT is a bad or good thing according to some metric — because the system of differential equations is large and complicated. But that's the sort of analysis economists do professionally.

---

Am I saying anything remarkable here? In some sense, no: It's easy to say "easy peasy, just model it as a system of differential equations," but harder to actually build a sensible model, let alone pin down its quantitative parameters. Furthermore, even systems that appear continuous on the surface can have phase transition or singularities.

And in some sense, yes: I feel like people often do round off small effects to zero, even in cases where this is clearly inappropriate. Similarly, I think it's quite common for people to use discrete threshold-based models, even though I think continuous models are often the more natural as a default.

It's also not necessarily impossible to set up reasonable systems of differential equations. In economics, for example, there really is a lot of theory and data available, which really do result in non-trivial insights. As another thought-provoking example, I've [seen it suggested](https://www.lesswrong.com/posts/BhGSXuvTvEtYtJXBe/list-of-civilisational-inadequacy#hEgMHPkd8SBRGETRb) that you could just measure people's hormone levels over time and then fit a system of differential equations to that data (except, unfortunately, we [apparently don't](https://www.lesswrong.com/posts/BhGSXuvTvEtYtJXBe/list-of-civilisational-inadequacy#yBFfuEEHmjiDeYEy6) yet have good enough measurement technology to do that).
