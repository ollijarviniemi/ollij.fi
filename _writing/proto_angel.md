---
sp: june 21 – july 15, 2026 · in progress
title: "Proto-Guardian Angels via Stock LLMs"
published: true
sitemap: false
---
# Proto-Guardian Angels via Stock LLMs
## Abstract
LLMs are increasingly able to automatically solve tasks, yet as of mid-2026, provide little in improving individual thinking and growth. Gwern proposes [*Guardian Angels*](https://gwern.net/guardian-angel), digital twin LLMs *trained to emulate* a single user's personality, values and preferences. I discuss complementary methods for individual empowerment via *frozen, stock LLMs*, realising presently achievable gains with low barriers to entry. I provide numerous example improvements from personal usage, including *active reading* via personalised exercises on curated, expert-written texts.
## Extended summary
For all their strengths, present-day frontier AIs have severe limitations for personalised use-cases: models regularly fail to infer and respect users' preferences [even in very predictable cases on in-distribution AI research tasks](https://blog.redwoodresearch.org/p/current-ais-seem-pretty-misaligned), and moreso in domains involving highly personalised and non-obvious preferences, such as writing and communication, UI/UX design, pedagogy, game design and personal decision-making. As a result, there's a disparity between models' capabilities and their value in empowering humans.

[Gwern proposes](https://gwern.net/guardian-angel) personalised *Guardian Angel* LLMs trained to emulate a single user, inferring and inheriting their taste, preferences and values, based on rich, active learning from past and present data on the user. GAs would thus have many desirable properties compared to traditional LLMs, including their (relative) alignment and deep personalised knowledge.

A major challenge with GAs is the reliance on training, complicating the implementation and increasing the barrier to entry; as of mid-2026, one can't buy "GAs-as-a-service", nor is there established culture or best practices for doing such training by one's self.

I discuss wielding frozen, stock frontier LLMs as "proto-GAs", for achieving some basic benefits of GAs and laying groundwork for full GAs later with lower barrier to entry.

Based on practical experience, I first list various concrete improvements from personalised, customisable software and data logging. These then enable *machine-augmented active reading:* proto-GAs curate human-written text, design exercises for the user to complete pre- and mid-reading, and construct cards for spaced repetition to be done later.

I release the code to empower other practitioners to experiment with and develop their own proto-GAs. (TODO)
## Introduction
Upon reading Gwern's article on Guardian Angels, I was impressed and motivated: "Yes, GAs are exactly what I want! I will maneuver myself so that it's easy for me to train my own GA! I will store all my data and collect more and write a lot and..."

This was naive in a useful way, as it made me confront many of the core questions and think about them in near-mode. What should I write if I wanted to create training data for my own GA? In fact, what is it that I'd want my GA to do? Gwern has the idea of an automated blogger, maybe I could have one of those... but what would it write, what is the writing I want to see more of? What is it that *I* want to write, or do more generally?

Eventually, I arrived at a couple of aims: First, I simply wanted to do more deep thinking, the sort one does by writing, in part to resolve some of the more confusing questions around GA usecases. Second, I also wanted to read more, not least because it would spur new thoughts.

Rather than waiting for the Guardian Angels to come and save me, I cut to the chase and started making problems on those problems now. And I realised that, while true GAs surely have their strengths, a lot of my needs in the immediate term could be resolved with out-of-the-box, stock LLMs purposed to support my development.

Below I walk through the steps I took. This is based on only one month of practical experience (work in progress!) and my thoughts on the topic are developing quickly. Hence, while I'm confident that the current system so far has been an improvement, I will likely have changed my mind on some important aspects a month from now.
## The basics
### Writing
My most productive, generative thinking happens when writing, yet for a long time I had lacked a place for writing that felt natural and satisfactory to me. (For far too long I did my writing and note-taking on Telegram chats and channels. They've served the need for a low-friction pathway to *writing down* a thought, but they're not designed for *thinking*.) Designing a nook for writing that feels like an extension of me, where I feel my text is *part of me* rather than being poured into an external container, is hence the natural first step.

I could have searched for existing applications that fit my needs, but why bother? I'm not asking for anything truly complicated, just that it suits *me* with all my easily satisfied yet nuanced preferences. And if the software is my own, I can easily customise and extend it when I inevitably think of better ways to amplify myself. Given the level of techonology nowadays, rolling out my own system was overdetermined.

A tolerable amount of prompting and iteration later, I now have a writing application I'm satisfied with. It's "just" a text editor served on my localhost (just like how Slack is just an app for sending messages and Instagram is just a website for sharing pictures) with some personal design choices and additions on top.

>  In particular, *improving the design can be a way of enhancing your ability to think and create*.  [...] This happens to students of mathematics when they begin using a serious typesetting system like LaTeX. Somehow the work seems more real when it is beautifully typeset on the page.
> – [Michael Nielsen](https://michaelnotebook.com/wn/website_enhance.html)

**Font and design.** I use "professional" serif fonts. Not only do I find them more aesthetic than typical sans serif fonts, they help me get into a better state of mind: I'm no longer writing a casual text message to my friend, I'm doing real thinking and real writing. Having similar layout to the other beautifully typeset, high-quality essays I've read reminds me of what to aim for. More broadly, I've taken the liberty to explicitly imitate good design I've seen elsewhere.

**A homepage.** As basic as it is, many writing applications – such as TeXMaker, which I've used for math writing – don't come with a homepage. To reduce any barrier to getting started, I've ensured my writing app has a homepage, consisting of lists of my draft files, graphically organised into sections.
### Reading
As with writing, reading is something I enjoy, but have not done as much I would have liked to. I have my favorite bloggers and forums, but their supply doesn't meet the demand, and I had not taken an active effort to seek for writers beyond the usual suspects.

The first thing I did was setting up an RSS feed. Given that I now have a digital home, it was natural to integrate the feed into the sidebar of my homepage, and now I'm more reliably finding and reading content from writers I know I like.

This still didn't address the supply-side issue, so my second step was setting up an LLM-based reading recommendation feed. Automatically every night, an LLM wakes up and searches for new material that I might like and adds findings to a buffer, the top 10 of which are shown to me.

Even simple implementations of this found me plenty of useful reading. Several factors make this task favorable to LLMs: First, they have superhumanly vast knowledge about publicly available text, which is further amplified by tireless web searches during run time. Second, my preferences in this domain have major, easily predictable chunks – for example, if I really like a text, it's not a bad bet that there's other material from the same author that I'll like. Third, the human baseline is low – as an example, somehow I had never noticed the "Archive" button at [Kevin Simler's](https://meltingasphalt.com/) site and thus never got into reading him, but now I've enjoyed several of his essays.

Moreover, the reading feed combines well with note-taking.
### Note-taking
I added a hotkey for myself via a browser extension to pop up a text field for me to write in. I'm now always one keystroke away from jotting down a thought that occurs to me related (or not) to a text I'm currently reading.

I've never previously in my life been a note-taking person, but the costs of taking a note are now extremely low: I can start immediately with zero context-switch, and thanks to LLMs I have no doubt about my ability to retrieve a relevant note later on. 

I now also enjoy very immediate benefits: My notes are automatically fed to the overnight LLM reading recommender as context, so even simple notes like "this was a great post!" help surface new reading to my feed tomorrow. (It also naturally makes the act of reading slightly more active: *Was* this a great post? *Do* I want to see more like this? Think carefully, because your answer matters!) Similarly, it's easy for me to imagine how accumulating notes and data about my preferences, reactions and deeper thoughts might prove useful in the longer run.
### Data storage and information flows
For the long term, all that matters is storing the relevant data. To extract value in the short term, the data has to be in the right place.

The former problem is relative easy: I simply log all thoughtful actions I take. This includes:
- All drafts that I write
- Any notes I write when reading. A copy of the page is archived locally in case it goes down later.
- My browsing events, to track what I spend my time on
- Anything I write to LLMs / coding agents.
    - I also save anything the LLMs write to me, overriding [the Claude Code default setting of session transcripts older than 30 days being automatically deleted](https://code.claude.com/docs/en/settings).

Furthermore, changes are auto-committed to a git repo every 15 minutes for storing a fine-grained version history.

The latter problem of managing information flows has been more finicky, as one needs to be more considerate of what data is useful for which purposes, and ensure there are no leaking pipes. In practice, I've found it useful to automatically load all my actions from the past 72 hours into the context of every coding agent I initiate, as this avoids me needing to re-explain the current context each time, and any issues or thoughts I rise (be it in my drafts or reading notes) will be seen by them as well.

Given the high value of my data and systems, I've also set up automatic, hourly, version-controlled backups for essentially all of my data – as with many things described here, setting this up has never been easier, and the downside risks are growing larger, which finally caused me to end my procrastination on this front.
## Active reading
Setting up the reading feed was an improvement, but as I read the texts, I felt a note of discord: Why again am I reading this LLM-recommended content? 

A big motivation for me was, unsurprisingly, that reading would help me learn useful things. This was the point of reading more and the motive for taking notes during reading. Yet, I feel like more is possible: it feels suboptimal for me to simply read a text, take some cursory notes on it, and then have that be the end of it. (While noticing surprises and jotting down "huh, that's an insightful point I haven't thought of before" is probably better than nothing, it doesn't seem like it's at the limits of possibility either.)
### Spaced repetition
One natural idea is to employ spaced repetition to ensure I will remember the useful parts of things I read. Spaced repetition notoriously has a non-trivial barrier to entry, with few people trying and sticking to it. Personally, I too have been hesitant to spend a lot of effort into designing cards and climbing the learning curve.

However, I believe LLMs can provide substantial support here: If I'm reading something, I don't need to start writing the front and backsides of the memory card right there. Instead, I can take a note and write "wow, [this story about Castle Bravo and Joseph Rotblat](https://michaelnotebook.com/whichfuture/index.html) is interesting and notable, I want to remember that", and then an LLM can create the cards for me ready for me to review the next day (is the dream, at least).

(TODO: more commentary on how successful this has been.)
### Exercises
Even spaced repetition is passive still – I still find it frighteningly plausible that I'll fall into the failure mode of unreflectively going through the motions and remembering snippets from texts, never really taking the time to reflect on what I read. (This is presumably made worse by my insistence on delegating the card creation to LLMs – spaced repetition [practitioners](https://augmentingcognition.com/ltm.html) [say](https://andymatuschak.org/prompts/) that creating the cards is itself part of the learning process .) Hence, I'd want to bake in a more active component to my reading.

Gwern has suggested the idea of [creativity meta-training for LLMs](https://gwern.net/idea#creativity-meta-training), which is a way of getting more juice out of high-quality text as training data, essentially by allowing the LLM to reason before – and in midst of – predicting text. Spend more compute, learn faster per data point.

Surely the same general principle applies to humans too: surely the optimal way for humans to read a text is not to just read it, from start to finish. Humans notoriously have hindsight bias, curse of knowledge creeps in quickly, memories get subtly overwritten so that we believe we had a better prior understanding than we actually had, it's easy to understimate the gap between verifying correctness of ideas and generating something of comparable quality...

How would we apply this principle to human learning (as next-token-prediction comes less naturally to us)? My current solution is to have my proto-GA – the same one that recommends texts to my reading feed – to create exercises to accompany the texts. These are either to be thought about at the very beginning or before reading the next section of the text. I currently have two types of exercises:

**Factual questions.** Most straightforwardly, the model can simply pick up a factual statement from the text and turn it into a factual question for me to ponder. For example, here are some questions from texts I've read lately:

- [How many times more energy does the US store as hydrocarbons than as grid-scale electricity?](https://www.construction-physics.com/p/50-things-ive-learned-writing-construction)
- [How many times AlphaGo Zero's (2017) training compute did GPT-3 (2020) use?](https://gwern.net/scaling-hypothesis)
- [By what multiple did combined Kalshi+Polymarket monthly trading volume grow from September 2025 to April 2026?](https://www.pewresearch.org/short-reads/2026/05/27/trading-volume-on-prediction-markets-has-soared-in-recent-months/)
- [Per CAISI, how far behind US models are the best Chinese models today?](https://blog.peterwildeford.com/p/how-banned-ai-chips-end-up-in-china)
- True or false: [Improved energy efficiency typically raises a society's total energy use through the rebound effect.](https://epoch.ai/gradient-updates/algorithmic-progress-likely-spurs-more-spending-on-compute-not-less)

For true/false questions, the exercise UI asks for a probabilistic assessment, helpfully decomposed into 5 discrete options (with small, integer payoffs as a more human-intuitive interface to the Brier scoring).

![](/assets/uploads/ar-credence-unanswered.png)

**Re-deriving the key content.** Factual questions still capture only a narrow portion of the value provided by writing.  Much of the writing I most appreciate introduces some new ideas, conceptual frames, considerations, arguments, theories, experimental designs and so on.

For these, I have exercises that prompt me to try and come up with myself the main contributions laid out in the text. Of course, most often I fail, given that I spend mere minutes on my exercise, while the authors spend days, weeks or months. But I find it useful to get feedback on *which* parts I missed, and then to ask "How could I have thought that myself?" This approach, to me, finally makes progress on making reading truly active.

Here are example exercises of this type:

- [A traditional view of intelligence explosion (IE) concerns AI being used to more effectively develop a successor AI. What other pathways to IE are there?](https://www.forethought.org/research/three-types-of-intelligence-explosion)
- [Conceive of milestones corresponding to how far AI automation has quantitatively progressed.](https://www.planned-obsolescence.org/p/six-milestones-for-ai-automation)
- [What valuable output does and can a forecaster produce beyond the probability itself?](https://forum.nunosempere.com/posts/qMP7LcCBFBEtuA3kL/the-rationale-shaped-hole-at-the-heart-of-forecasting)
- [Based on historical data, how could one evidence whether a software-only intelligence explosion is possible?](https://www.forethought.org/research/will-ai-r-and-d-automation-cause-a-software-intelligence-explosion)
- [How could you verify that a datacenter is running only approved inference, and not secret training, without trusting its operator?](https://ai-2040.com/supplements/verification-plan)

Especially with this latter exercise type, the LLMs are not terribly reliable in their execution. The downside cost of this is not too low – it's a bit annoying, but it doesn't take many seconds to dismiss the exercise. And often it's just fine: if a question has a confused framing, then, well, what do *I* think is the right way to think about it? What matters is not so much the question, but the promise that the text (written by a thoughtful human) will have discussion that I can compare my thinking against.
## Insight-through-making for proto-GA
Ultimately, what I want out of Guardian Angels is not fun little exercises or spaced repetition cards, and so assessing their success by their ability to do that would be misguided. The real tests are more like "am I writing more and higher-quality blog posts thanks to GAs?", "am I able to do better thinking on hard and confusing topics?" and "am I producing useful contributions that result in positive changes in the world?"

It's unpromising to try and *directly* build, for example, an "automated blogger" out of current stock LLMs; similarly, I haven't heard of anyone yet succeeding at building useful "thinking assistants".

This is why I'm looking for ways in which stock LLMs could help *indirectly*, via making *me* better equipped and skilled to do the object-level work. The LLMs' job will be very different from mine: for example, building writing software has little overlap with the act of writing itself (but still robustly useful); similarly, preparing material for active reading is distinct from active reading.

This isn't contradictory with eventually taking direct stabs at automation. In fact, the opposite is true: one of the things I'm hoping to get from working with proto-GAs is to be better able to use the opportunity if and when GAs break through. Notably, the challenge of building GAs isn't primarily an ML problem (any more than [AI for epistemics](https://ai-2040.com/supplements/ai-for-epistemics) is), but seems to be much more bottlenecked on fuzzy questions.

My process behind the idea of active reading seems decent for making progress on these problems (keeping in mind that the idea itself hasn't yet proven its worth!). I see it as an attempt to execute what Matuschak and Nielsen call [insight-through-making](https://numinous.productions/ttft/) (and as a product of executing it – my active reading setup is itself an insight that came through making the basic writing and reading infra!) So I hope that if it fails to be useful in itself, it at least provides insight for something new and successful.

## Code
(TODO: compile code, publish and link)

## Related reading
- [Design Sketches: Angels-on-the-Shoulder](https://www.forethought.org/research/design-sketches-angels-on-the-shoulder) — Owen Cotton-Barratt, Lizka Vaintrob, Oly Sourbut and Rose Hadshar, 2026
- [Design sketches for a more sensible world](https://www.forethought.org/research/design-sketches-for-a-more-sensible-world) — Owen Cotton-Barratt, Lizka Vaintrob, Oly Sourbut and Rose Hadshar, 2026
- [Guardian Angels: LLM Personalization for Productivity and Security](https://gwern.net/guardian-angel) — Gwern, 2026
- [Comment on Guardian Angels](https://www.lesswrong.com/posts/siWqHqCSybdhtWGud?commentId=iHKBTbdkKmfzsuJXg) — Oliver Habryka, 2026
- [AI for Epistemics](https://ai-2040.com/supplements/ai-for-epistemics) — Eli Lifland, 2026
- [How can we develop transformative tools for thought?](https://numinous.productions/ttft/) — Andy Matuschak and Michael Nielsen, 2019
- [Augmenting Long-term Memory](https://augmentingcognition.com/ltm.html) — Michael Nielsen, 2018
- [Creativity Meta-Training](https://gwern.net/idea#creativity-meta-training) — Gwern, 2026
- [10 non-boring ways I've used AI in the last month](https://www.lesswrong.com/posts/bxdwSZYxKmPBres6w/10-non-boring-ways-i-ve-used-ai-in-the-last-month) — Oliver Habryka, 2026
- [Film Study for Research](https://bounded-regret.ghost.io/film-study/) — Jacob Steinhardt
- [AI Forecasting in 2026: What 11 Analyses Say](https://forum.nunosempere.com/posts/Spyz3wESZu2eeqhDj/ai-forecasting-in-2026-what-11-analyses-say) — Benjamin Wilson and Metaculus, 2026
